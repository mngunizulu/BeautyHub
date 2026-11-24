import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db, inventoryMovements, inventoryOrderReceipts, inventoryOrders, inventoryProducts, inventorySuppliers, locations } from "@workspace/db";
import { HttpError } from "../lib/http-error";
import { input, tenantId, uuid } from "../lib/input";
import { allowRoles, requireAuthentication, requireOrganization } from "../middlewares/authentication";
import type { BookingTransaction } from "../services/booking-quote";

export const inventoryRouter: IRouter = Router();
const path = "/organizations/:organizationId/locations/:locationId/inventory";
inventoryRouter.use(path, requireAuthentication, requireOrganization, allowRoles("owner", "manager"));

const productInput = z.strictObject({
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._-]{0,39}$/),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().max(120),
  supplier: z.string().trim().max(120),
  imageUrl: z.string().trim().max(500).refine((value) => value === "" || (URL.canParse(value) && new URL(value).protocol === "https:")),
  purchaseCostCents: z.number().int().min(0).max(10_000_000).nullable().optional(),
  unitCents: z.number().int().positive().max(10_000_000),
  reorderAt: z.number().int().min(0).max(1_000_000),
  archived: z.boolean().default(false),
});

async function assertLocation(tx: BookingTransaction, organizationId: string, locationId: string, lock = false) {
  const query = tx.select({ id: locations.id }).from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.organizationId, organizationId)));
  const [row] = await (lock ? query.for("update") : query);
  if (!row) throw new HttpError(404, "Standort nicht gefunden.");
}

const productScope = (locationId: string, productId: string) =>
  and(eq(inventoryProducts.locationId, locationId), eq(inventoryProducts.id, productId));

inventoryRouter.get(path, async (req, res) => {
  const locationId = uuid(req.params.locationId);
  const products = await db.transaction(async (tx) => {
    await assertLocation(tx, tenantId(req), locationId);
    return tx.select().from(inventoryProducts).where(eq(inventoryProducts.locationId, locationId))
      .orderBy(asc(inventoryProducts.archived), asc(inventoryProducts.name), asc(inventoryProducts.id));
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  res.set("Cache-Control", "no-store").json(products);
});

inventoryRouter.post(path, async (req, res) => {
  const locationId = uuid(req.params.locationId);
  const data = input(productInput, req.body);
  const row = await db.transaction(async (tx) => {
    await assertLocation(tx, tenantId(req), locationId, true);
    const [product] = await tx.insert(inventoryProducts).values({ ...data, locationId })
      .onConflictDoNothing({ target: [inventoryProducts.locationId, inventoryProducts.sku] }).returning();
    if (!product) throw new HttpError(409, "Diese Artikelnummer ist am Standort bereits vergeben.");
    return product;
  });
  res.status(201).json(row);
});

inventoryRouter.put(path + "/:productId", async (req, res) => {
  const locationId = uuid(req.params.locationId);
  const productId = uuid(req.params.productId);
  const data = input(productInput, req.body);
  const row = await db.transaction(async (tx) => {
    await assertLocation(tx, tenantId(req), locationId, true);
    const [duplicate] = await tx.select({ id: inventoryProducts.id }).from(inventoryProducts)
      .where(and(eq(inventoryProducts.locationId, locationId), eq(inventoryProducts.sku, data.sku)));
    if (duplicate && duplicate.id !== productId) throw new HttpError(409, "Diese Artikelnummer ist am Standort bereits vergeben.");
    const [product] = await tx.update(inventoryProducts).set(data).where(productScope(locationId, productId)).returning();
    if (!product) throw new HttpError(404, "Artikel nicht gefunden.");
    return product;
  });
  res.json(row);
});

const movementPath = path + "/:productId/movements";
inventoryRouter.get(movementPath, async (req, res) => {
  const locationId = uuid(req.params.locationId);
  const productId = uuid(req.params.productId);
  const rows = await db.transaction(async (tx) => {
    await assertLocation(tx, tenantId(req), locationId);
    const [product] = await tx.select({ id: inventoryProducts.id }).from(inventoryProducts).where(productScope(locationId, productId));
    if (!product) throw new HttpError(404, "Artikel nicht gefunden.");
    return tx.select().from(inventoryMovements).where(eq(inventoryMovements.productId, productId))
      .orderBy(desc(inventoryMovements.createdAt), desc(inventoryMovements.id)).limit(100);
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  res.set("Cache-Control", "no-store").json(rows);
});

inventoryRouter.post(movementPath, async (req, res) => {
  const locationId = uuid(req.params.locationId);
  const productId = uuid(req.params.productId);
  const data = input(z.strictObject({
    idempotencyKey: z.uuid(), kind: z.enum(["receipt", "adjustment"]), quantity: z.number().int().min(-1_000_000).max(1_000_000),
    reason: z.string().trim().min(1).max(240),
  }), req.body);
  if (data.quantity === 0 || (data.kind === "receipt" && data.quantity < 0)) throw new HttpError(400, "Menge passt nicht zur Lagerbewegung.");
  const result = await db.transaction(async (tx) => {
    await assertLocation(tx, tenantId(req), locationId);
    const [product] = await tx.select().from(inventoryProducts).where(productScope(locationId, productId)).for("update");
    if (!product) throw new HttpError(404, "Artikel nicht gefunden.");
    const [existing] = await tx.select().from(inventoryMovements).where(and(
      eq(inventoryMovements.productId, productId), eq(inventoryMovements.idempotencyKey, data.idempotencyKey),
    ));
    if (existing) {
      if (existing.kind !== data.kind || existing.quantity !== data.quantity || existing.reason !== data.reason) {
        throw new HttpError(409, "Diese Anfrage wurde bereits mit anderen Angaben verwendet.");
      }
      return { row: existing, created: false };
    }
    const balance = product.stock + data.quantity;
    if (product.archived || balance < 0 || balance > 2147483647) throw new HttpError(409, "Bestand kann nicht gebucht werden.");
    await tx.update(inventoryProducts).set({ stock: balance }).where(eq(inventoryProducts.id, productId));
    const [row] = await tx.insert(inventoryMovements).values({ ...data, productId, balance, actorId: req.identity!.id }).returning();
    return { row, created: true };
  });
  res.status(result.created ? 201 : 200).json(result.row);
});

const supplierPath = path + "/suppliers";
const supplierInput = z.strictObject({
  name: z.string().trim().min(1).max(120),
  email: z.union([z.literal(""), z.email()]).default(""),
  phone: z.string().trim().max(30).default(""),
});

inventoryRouter.get(supplierPath, async (req, res) => {
  const locationId = uuid(req.params.locationId);
  const rows = await db.transaction(async (tx) => {
    await assertLocation(tx, tenantId(req), locationId);
    return tx.select().from(inventorySuppliers).where(eq(inventorySuppliers.locationId, locationId)).orderBy(asc(inventorySuppliers.name));
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  res.set("Cache-Control", "no-store").json(rows);
});

inventoryRouter.post(supplierPath, async (req, res) => {
  const locationId = uuid(req.params.locationId);
  const data = input(supplierInput, req.body);
  const row = await db.transaction(async (tx) => {
    await assertLocation(tx, tenantId(req), locationId, true);
    const [supplier] = await tx.insert(inventorySuppliers).values({ ...data, locationId })
      .onConflictDoNothing({ target: [inventorySuppliers.locationId, inventorySuppliers.name] }).returning();
    if (!supplier) throw new HttpError(409, "Lieferant ist am Standort bereits vorhanden.");
    return supplier;
  });
  res.status(201).json(row);
});

inventoryRouter.put(supplierPath + "/:supplierId", async (req, res) => {
  const locationId = uuid(req.params.locationId);
  const supplierId = uuid(req.params.supplierId);
  const data = input(supplierInput, req.body);
  const row = await db.transaction(async (tx) => {
    await assertLocation(tx, tenantId(req), locationId, true);
    const [duplicate] = await tx.select({ id: inventorySuppliers.id }).from(inventorySuppliers)
      .where(and(eq(inventorySuppliers.locationId, locationId), eq(inventorySuppliers.name, data.name)));
    if (duplicate && duplicate.id !== supplierId) throw new HttpError(409, "Lieferant ist am Standort bereits vorhanden.");
    const [supplier] = await tx.update(inventorySuppliers).set(data)
      .where(and(eq(inventorySuppliers.locationId, locationId), eq(inventorySuppliers.id, supplierId))).returning();
    if (!supplier) throw new HttpError(404, "Lieferant nicht gefunden.");
    return supplier;
  });
  res.json(row);
});

const ordersPath = path + "/purchase-orders";
inventoryRouter.get(ordersPath, async (req, res) => {
  const locationId = uuid(req.params.locationId);
  const rows = await db.transaction(async (tx) => {
    await assertLocation(tx, tenantId(req), locationId);
    return tx.select().from(inventoryOrders).where(eq(inventoryOrders.locationId, locationId))
      .orderBy(sql`${inventoryOrders.closedAt} asc nulls first`, desc(inventoryOrders.createdAt), desc(inventoryOrders.id)).limit(100);
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  res.set("Cache-Control", "no-store").json(rows);
});

inventoryRouter.post(ordersPath, async (req, res) => {
  const locationId = uuid(req.params.locationId);
  const data = input(z.strictObject({
    idempotencyKey: z.uuid(), supplierId: z.uuid(),
    items: z.array(z.strictObject({ productId: z.uuid(), quantity: z.number().int().min(1).max(1_000_000) })).min(1).max(30),
  }), req.body);
  const requested = data.items.sort((a, b) => a.productId.localeCompare(b.productId));
  const productIds = [...new Set(requested.map(({ productId }) => productId))];
  if (productIds.length !== requested.length) throw new HttpError(400, "Jeder Artikel darf nur einmal bestellt werden.");
  const result = await db.transaction(async (tx) => {
    await assertLocation(tx, tenantId(req), locationId, true);
    const [existing] = await tx.select().from(inventoryOrders).where(and(
      eq(inventoryOrders.locationId, locationId), eq(inventoryOrders.idempotencyKey, data.idempotencyKey),
    ));
    if (existing) {
      if (existing.supplierId !== data.supplierId || existing.items.length !== requested.length ||
        existing.items.some((item, index) => item.productId !== requested[index]?.productId || item.quantity !== requested[index]?.quantity)) {
        throw new HttpError(409, "Diese Bestellung wurde bereits mit anderen Angaben erfasst.");
      }
      return { order: existing, created: false };
    }
    const [supplier] = await tx.select().from(inventorySuppliers).where(and(
      eq(inventorySuppliers.locationId, locationId), eq(inventorySuppliers.id, data.supplierId),
    ));
    if (!supplier) throw new HttpError(404, "Lieferant nicht gefunden.");
    const products = await tx.select().from(inventoryProducts).where(and(
      eq(inventoryProducts.locationId, locationId), inArray(inventoryProducts.id, productIds), eq(inventoryProducts.archived, false),
    ));
    if (products.length !== productIds.length) throw new HttpError(409, "Mindestens ein Artikel ist am Standort nicht bestellbar.");
    const byId = new Map(products.map((row) => [row.id, row]));
    const items = requested.map((item) => ({ ...item, sku: byId.get(item.productId)!.sku, name: byId.get(item.productId)!.name, purchaseCostCents: byId.get(item.productId)!.purchaseCostCents }));
    const [order] = await tx.insert(inventoryOrders).values({
      ...data, items, locationId, supplierName: supplier.name, actorId: req.identity!.id,
    }).returning();
    return { order, created: true };
  });
  res.status(result.created ? 201 : 200).json(result.order);
});

async function lockOrder(tx: BookingTransaction, locationId: string, organizationId: string, orderId: string) {
  await assertLocation(tx, organizationId, locationId);
  const [order] = await tx.select().from(inventoryOrders)
    .where(and(eq(inventoryOrders.locationId, locationId), eq(inventoryOrders.id, orderId))).for("update");
  if (!order) throw new HttpError(404, "Bestellung nicht gefunden.");
  return order;
}

async function receiveOrder(
  tx: BookingTransaction, order: typeof inventoryOrders.$inferSelect, actorId: string, movementKey: string,
  delivery: { productId: string; quantity: number }[],
) {
  if (order.status !== "open") throw new HttpError(409, "Bestellung wurde bereits abgeschlossen.");
  const quantities = new Map(delivery.map(({ productId, quantity }) => [productId, quantity]));
  const items = order.items.map((line) => {
    const receivedQuantity = (line.receivedQuantity ?? 0) + (quantities.get(line.productId) ?? 0);
    if (receivedQuantity > line.quantity) throw new HttpError(409, "Liefermenge ueberschreitet die offene Bestellmenge.");
    return { ...line, receivedQuantity };
  });
  if (delivery.some(({ productId }) => !items.some((line) => line.productId === productId))) {
    throw new HttpError(400, "Artikel ist nicht Teil der Bestellung.");
  }
  const products = await tx.select().from(inventoryProducts).where(and(eq(inventoryProducts.locationId, order.locationId),
    inArray(inventoryProducts.id, [...quantities.keys()]))).orderBy(asc(inventoryProducts.id)).for("update");
  if (products.length !== quantities.size) throw new HttpError(409, "Bestellartikel fehlt am Standort.");
  for (const product of products) {
    const quantity = quantities.get(product.id)!;
    const balance = product.stock + quantity;
    if (product.archived || balance > 2147483647) throw new HttpError(409, "Wareneingang kann nicht gebucht werden.");
    await tx.update(inventoryProducts).set({ stock: balance }).where(eq(inventoryProducts.id, product.id));
    await tx.insert(inventoryMovements).values({ productId: product.id, actorId, idempotencyKey: movementKey,
      kind: "receipt", quantity, balance, reason: "Bestellung " + order.id });
  }
  const complete = items.every(({ receivedQuantity, quantity }) => receivedQuantity === quantity);
  const [updated] = await tx.update(inventoryOrders).set({
    items, status: complete ? "received" : "open", closedAt: complete ? new Date() : null,
  }).where(eq(inventoryOrders.id, order.id)).returning();
  return updated;
}

inventoryRouter.post(ordersPath + "/:orderId/receipts", async (req, res) => {
  const locationId = uuid(req.params.locationId);
  const orderId = uuid(req.params.orderId);
  const data = input(z.strictObject({
    idempotencyKey: z.uuid(),
    items: z.array(z.strictObject({ productId: z.uuid(), quantity: z.number().int().min(1).max(1_000_000) })).min(1).max(30),
  }), req.body);
  const items = data.items.sort((a, b) => a.productId.localeCompare(b.productId));
  if (new Set(items.map(({ productId }) => productId)).size !== items.length) throw new HttpError(400, "Doppelter Bestellartikel.");
  const result = await db.transaction(async (tx) => {
    const order = await lockOrder(tx, locationId, tenantId(req), orderId);
    const [prior] = await tx.select().from(inventoryOrderReceipts).where(and(
      eq(inventoryOrderReceipts.orderId, orderId), eq(inventoryOrderReceipts.idempotencyKey, data.idempotencyKey)));
    if (prior) {
      if (prior.items.length !== items.length || prior.items.some((item, index) =>
        item.productId !== items[index]?.productId || item.quantity !== items[index]?.quantity)) {
        throw new HttpError(409, "Dieser Wareneingang wurde bereits mit anderen Angaben gebucht.");
      }
      return { order, created: false };
    }
    const [receipt] = await tx.insert(inventoryOrderReceipts).values({ ...data, items, orderId }).returning();
    const updated = await receiveOrder(tx, order, req.identity!.id, receipt!.id, items);
    return { order: updated, created: true };
  });
  res.status(result.created ? 201 : 200).json(result.order);
});

inventoryRouter.post(ordersPath + "/:orderId/status", async (req, res) => {
  const { status } = input(z.strictObject({ status: z.enum(["received", "cancelled"]) }), req.body);
  const order = await db.transaction(async (tx) => {
    const current = await lockOrder(tx, uuid(req.params.locationId), tenantId(req), uuid(req.params.orderId));
    if (current.status === status) return current;
    if (current.status !== "open") throw new HttpError(409, "Bestellung wurde bereits abgeschlossen.");
    if (status === "received") {
      const remaining = current.items.map(({ productId, quantity, receivedQuantity }) =>
        ({ productId, quantity: quantity - (receivedQuantity ?? 0) })).filter(({ quantity }) => quantity > 0);
      return receiveOrder(tx, current, req.identity!.id, current.id, remaining);
    }
    const [updated] = await tx.update(inventoryOrders).set({ status, closedAt: new Date() })
      .where(eq(inventoryOrders.id, current.id)).returning();
    return updated;
  });
  res.json(order);
});
