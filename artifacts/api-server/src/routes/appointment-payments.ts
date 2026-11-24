import { Router, type IRouter } from "express";
import { and, asc, desc, eq, exists, gt, inArray, or, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { RecordAppointmentPaymentBody, RecordAppointmentRefundBody } from "@workspace/api-zod";
import { appointmentPayments, appointmentRefunds, customerPackages, db, inventoryMovements, inventoryProducts, locations, loyaltyRedemptions, packageUses, posVouchers, reservations, retailRefunds, retailSales, servicePackages } from "@workspace/db";
import { HttpError } from "../lib/http-error";
import { input, tenantId, uuid } from "../lib/input";
import { simulatedAppointmentPayments } from "../lib/payments";
import { allowRoles, requireAuthentication, requireOrganization } from "../middlewares/authentication";
import type { BookingTransaction } from "../services/booking-quote";

export const appointmentPaymentsRouter: IRouter = Router();
const path = "/organizations/:organizationId/booking-calendar/:id/payments";
appointmentPaymentsRouter.use(path, requireAuthentication, requireOrganization, allowRoles("owner", "manager"));

const dailyPath = "/organizations/:organizationId/locations/:locationId/appointment-transactions";
appointmentPaymentsRouter.get(dailyPath, requireAuthentication, requireOrganization, allowRoles("owner", "manager"), async (req, res) => {
  const locationId = uuid(req.params.locationId);
  const organizationId = tenantId(req);
  const query = input(z.strictObject({
    date: z.iso.date(),
    page: z.string().regex(/^[0-9]{1,5}$/).default("0").transform(Number),
  }), req.query);
  const report = await db.transaction(async (tx) => {
    const [location] = await tx.select({ timezone: locations.timezone }).from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.organizationId, organizationId)));
    if (!location) throw new HttpError(404, "Standort nicht gefunden.");
    const result = await tx.execute(sql`
      WITH bounds AS (
        SELECT (${query.date}::date::timestamp AT TIME ZONE ${location.timezone}) AS starts,
          ((${query.date}::date + 1)::timestamp AT TIME ZONE ${location.timezone}) AS ends
      ), movements AS (
        SELECT p.id, p.booking_id AS "bookingId", p.id AS "paymentId",
          p.created_at AS "recordedAt", p.method, p.kind, p.amount_cents AS "amountCents", p.discount_cents AS "discountCents"
        FROM appointment_payments p
        JOIN bookings b ON b.id = p.booking_id CROSS JOIN bounds
        WHERE b.location_id = ${locationId} AND p.created_at >= bounds.starts AND p.created_at < bounds.ends
        UNION ALL
        SELECT r.id, p.booking_id AS "bookingId", p.id AS "paymentId",
          r.created_at AS "recordedAt", p.method, 'refund' AS kind, r.amount_cents AS "amountCents", 0 AS "discountCents"
        FROM appointment_refunds r
        JOIN appointment_payments p ON p.id = r.payment_id
        JOIN bookings b ON b.id = p.booking_id CROSS JOIN bounds
        WHERE b.location_id = ${locationId} AND r.created_at >= bounds.starts AND r.created_at < bounds.ends
        UNION ALL
        SELECT sale.id, NULL::uuid AS "bookingId", sale.id AS "paymentId",
          sale.created_at AS "recordedAt", sale.method, 'retail' AS kind, sale.amount_cents AS "amountCents", sale.discount_cents AS "discountCents"
        FROM retail_sales sale CROSS JOIN bounds
        WHERE sale.location_id = ${locationId} AND sale.created_at >= bounds.starts AND sale.created_at < bounds.ends
        UNION ALL
        SELECT r.id, NULL::uuid, sale.id, r.created_at, sale.method, 'retail_refund', r.amount_cents, 0
        FROM retail_refunds r JOIN retail_sales sale ON sale.id = r.sale_id CROSS JOIN bounds
        WHERE sale.location_id = ${locationId} AND r.created_at >= bounds.starts AND r.created_at < bounds.ends
      ), current_page AS (
        SELECT * FROM movements ORDER BY "recordedAt" DESC, id DESC, kind LIMIT 50 OFFSET ${query.page * 50}
      ), totals AS (
        SELECT method, sum(CASE WHEN kind not in ('refund', 'retail_refund') THEN "amountCents" ELSE 0 END) AS "receivedCents",
          sum(CASE WHEN kind in ('refund', 'retail_refund') THEN "amountCents" ELSE 0 END) AS "refundedCents", sum("discountCents") AS "discountCents"
        FROM movements GROUP BY method ORDER BY method
      )
      SELECT (SELECT count(*)::int FROM movements) AS count,
        coalesce((SELECT jsonb_agg(current_page ORDER BY "recordedAt" DESC, id DESC, kind) FROM current_page), '[]') AS entries,
        coalesce((SELECT jsonb_agg(totals ORDER BY method) FROM totals), '[]') AS totals
    `);
    return { ...result.rows[0], date: query.date, timezone: location.timezone, currency: "EUR" };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  res.set("Cache-Control", "no-store").json(report);
});

const voucherCodeInput = z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{4,32}$/);
const vouchersPath = "/organizations/:organizationId/pos-vouchers";
appointmentPaymentsRouter.use(vouchersPath, requireAuthentication, requireOrganization, allowRoles("owner", "manager"));

appointmentPaymentsRouter.get(vouchersPath, async (req, res) => {
  const vouchers = await db.select().from(posVouchers).where(and(eq(posVouchers.organizationId, tenantId(req)), eq(posVouchers.loyaltyOnly, false)))
    .orderBy(posVouchers.redeemedAt, posVouchers.code).limit(100);
  res.set("Cache-Control", "no-store").json(vouchers);
});

appointmentPaymentsRouter.post(vouchersPath, async (req, res) => {
  const data = input(z.strictObject({
    code: voucherCodeInput, discountCents: z.number().int().positive().max(2147483647),
    expiresAt: z.iso.datetime().optional(),
  }), req.body);
  const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
  if (expiresAt && +expiresAt <= Date.now()) throw new HttpError(400, "Das Ablaufdatum muss in der Zukunft liegen.");
  const [entry] = await db.insert(posVouchers).values({ ...data, expiresAt, organizationId: tenantId(req) })
    .onConflictDoNothing({ target: [posVouchers.organizationId, posVouchers.code] }).returning();
  if (!entry) throw new HttpError(409, "Gutscheincode ist bereits vergeben.");
  res.status(201).json(entry);
});

appointmentPaymentsRouter.post(vouchersPath + "/gifts", async (req, res) => {
  const { discountCents, requestId } = input(z.strictObject({
    discountCents: z.number().int().min(1).max(100000), requestId: z.uuid(),
  }), req.body);
  const organizationId = tenantId(req);
  const code = "GESCHENK-" + requestId.replaceAll("-", "").toUpperCase().slice(0, 23);
  const [created] = await db.insert(posVouchers).values({ organizationId, discountCents, isGift: true, code })
    .onConflictDoNothing({ target: [posVouchers.organizationId, posVouchers.code] }).returning();
  if (created) {
    res.status(201).json(created);
    return;
  }
  const [prior] = await db.select().from(posVouchers)
    .where(and(eq(posVouchers.organizationId, organizationId), eq(posVouchers.code, code)));
  if (!prior?.isGift || prior.discountCents !== discountCents) throw new HttpError(409, "Geschenkschlüssel bereits verwendet.");
  res.json(prior);
});

appointmentPaymentsRouter.get(vouchersPath + "/:code", async (req, res) => {
  const code = input(voucherCodeInput, req.params.code);
  const [voucher] = await db.select().from(posVouchers).where(and(eq(posVouchers.organizationId, tenantId(req)), eq(posVouchers.code, code)));
  if (!voucher || voucher.redeemedAt || (voucher.expiresAt && +voucher.expiresAt <= Date.now())) {
    throw new HttpError(404, "Gutschein ist nicht verfuegbar.");
  }
  res.set("Cache-Control", "no-store").json({ code: voucher.code, discountCents: voucher.discountCents });
});

async function redeemVoucher(tx: BookingTransaction, organizationId: string, code: string, customerId?: string | null) {
  const unrestricted = eq(posVouchers.loyaltyOnly, false);
  const allowed = customerId ? or(unrestricted, exists(tx.select({ id: loyaltyRedemptions.voucherId })
    .from(loyaltyRedemptions).where(and(eq(loyaltyRedemptions.voucherId, posVouchers.id),
      eq(loyaltyRedemptions.userId, customerId))))) : unrestricted;
  const [voucher] = await tx.update(posVouchers).set({ redeemedAt: new Date() }).where(and(
    eq(posVouchers.organizationId, organizationId), eq(posVouchers.code, code), allowed,
    sql`${posVouchers.redeemedAt} is null and (${posVouchers.expiresAt} is null or ${posVouchers.expiresAt} > clock_timestamp())`,
  )).returning();
  if (!voucher) throw new HttpError(409, "Gutschein ist nicht verfuegbar.");
  return voucher;
}

async function appointmentBalance(tx: BookingTransaction, organizationId: string, bookingId: string, lock = false) {
  const lookup = tx.select({ booking: reservations }).from(reservations)
    .innerJoin(locations, eq(locations.id, reservations.locationId))
    .where(and(eq(reservations.id, bookingId), eq(locations.organizationId, organizationId)));
  const [row] = await (lock ? lookup.for("update", { of: reservations }) : lookup);
  if (!row) throw new HttpError(404, "Termin nicht gefunden.");
  const entries = await tx.select().from(appointmentPayments).where(eq(appointmentPayments.bookingId, bookingId))
    .orderBy(desc(appointmentPayments.createdAt), desc(appointmentPayments.id));
  const refunds = entries.length ? await tx.select().from(appointmentRefunds)
    .where(inArray(appointmentRefunds.paymentId, entries.map(({ id }) => id)))
    .orderBy(desc(appointmentRefunds.createdAt), desc(appointmentRefunds.id)) : [];
  const [coverage] = await tx.select({ coveredCents: packageUses.coveredCents }).from(packageUses)
    .where(eq(packageUses.bookingId, bookingId));
  const packageCoveredCents = coverage?.coveredCents ?? 0;
  const refundedCents = refunds.reduce((sum, entry) => sum + entry.amountCents, 0);
  const paidCents = entries.reduce((sum, entry) => sum + entry.amountCents, 0);
  const discountCents = entries.reduce((sum, entry) => sum + entry.discountCents, 0);
  return { booking: row.booking, entries, refunds, refundedCents, paidCents, discountCents,
    packageCoveredCents, outstandingCents: row.booking.priceCents - paidCents - discountCents - packageCoveredCents };
}

appointmentPaymentsRouter.get("/me/bookings/:id/payment-history", requireAuthentication, async (req, res) => {
  const bookingId = uuid(req.params.id);
  const result = await db.transaction(async (tx) => {
    const [row] = await tx.select({ priceCents: reservations.priceCents }).from(reservations)
      .where(and(eq(reservations.id, bookingId), eq(reservations.userId, req.identity!.id)));
    if (!row) throw new HttpError(404, "Termin nicht gefunden.");
    const payments = await tx.select({
      id: appointmentPayments.id, kind: appointmentPayments.kind, method: appointmentPayments.method,
      amountCents: appointmentPayments.amountCents, discountCents: appointmentPayments.discountCents, createdAt: appointmentPayments.createdAt,
    }).from(appointmentPayments).where(eq(appointmentPayments.bookingId, bookingId)).orderBy(desc(appointmentPayments.createdAt));
    const refunds = payments.length ? await tx.select({
      id: appointmentRefunds.id, paymentId: appointmentRefunds.paymentId,
      amountCents: appointmentRefunds.amountCents, createdAt: appointmentRefunds.createdAt,
    }).from(appointmentRefunds).where(inArray(appointmentRefunds.paymentId, payments.map(({ id }) => id)))
      .orderBy(desc(appointmentRefunds.createdAt)) : [];
    const [coverage] = await tx.select({ coveredCents: packageUses.coveredCents }).from(packageUses)
      .where(eq(packageUses.bookingId, bookingId));
    return { currency: "EUR", payments, refunds, packageCoveredCents: coverage?.coveredCents ?? 0 };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  res.json(result);
});

appointmentPaymentsRouter.get(path, async (req, res) => {
  const { entries, refunds, refundedCents, paidCents, discountCents, outstandingCents, packageCoveredCents } = await db.transaction(
    (tx) => appointmentBalance(tx, tenantId(req), uuid(req.params.id)),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
  res.set("Cache-Control", "no-store").json({ entries, refunds, refundedCents, paidCents, discountCents, outstandingCents, packageCoveredCents, currency: "EUR" });
});

appointmentPaymentsRouter.post(path + "/package", async (req, res) => {
  const bookingId = uuid(req.params.id);
  const organizationId = tenantId(req);
  await db.transaction(async (tx) => {
    const balance = await appointmentBalance(tx, organizationId, bookingId, true);
    if (balance.packageCoveredCents) return;
    const { booking } = balance;
    const item = booking.items[0];
    if (booking.status !== "completed" || !booking.userId || !item || booking.items.length !== 1 ||
        item.variantId || balance.entries.length || balance.outstandingCents <= 0) {
      throw new HttpError(409, "Dieser Termin kann nicht mit einem Paket bezahlt werden.");
    }
    const [eligible] = await tx.select({ id: customerPackages.id }).from(customerPackages)
      .innerJoin(servicePackages, eq(servicePackages.id, customerPackages.packageId))
      .where(and(eq(servicePackages.organizationId, organizationId), eq(servicePackages.serviceId, item.serviceId),
        eq(customerPackages.userId, booking.userId), gt(customerPackages.remaining, 0),
        gt(customerPackages.expiresAt, sql`clock_timestamp()`)))
      .orderBy(asc(customerPackages.expiresAt), asc(customerPackages.id)).limit(1).for("update", { of: customerPackages });
    if (!eligible) throw new HttpError(409, "Kein passendes gültiges Paket mit freien Terminen.");
    await tx.update(customerPackages).set({ remaining: sql`${customerPackages.remaining} - 1` })
      .where(eq(customerPackages.id, eligible.id));
    await tx.insert(packageUses).values({ bookingId, customerPackageId: eligible.id, actorId: req.identity!.id,
      coveredCents: balance.outstandingCents });
  });
  res.status(204).end();
});

appointmentPaymentsRouter.post(path, async (req, res) => {
  const bookingId = uuid(req.params.id);
  const data = input(RecordAppointmentPaymentBody.extend({
    discountReason: z.string().trim().min(1).max(240).optional(), voucherCode: voucherCodeInput.optional(),
  }).strict(), req.body);
  const manualDiscount = data.discountCents ?? 0;
  const discountReason = data.voucherCode ? "Gutschein " + data.voucherCode : data.discountReason ?? null;
  const requestedDiscount = manualDiscount > 0 || !!data.voucherCode;
  if (data.voucherCode && (manualDiscount > 0 || data.discountReason)) throw new HttpError(400, "Bitte Gutschein oder manuellen Rabatt waehlen.");
  if (requestedDiscount !== (discountReason !== null) || (data.kind !== "settlement" && requestedDiscount)) {
    throw new HttpError(400, "Ein Rabatt erfordert eine Restzahlung und einen Grund.");
  }
  const result = await db.transaction(async (tx) => {
    const balance = await appointmentBalance(tx, tenantId(req), bookingId, true);
    const existing = balance.entries.find((entry) => entry.idempotencyKey === data.idempotencyKey);
    if (existing) {
      if (existing.amountCents !== data.amountCents || existing.kind !== data.kind || existing.method !== data.method ||
        (!data.voucherCode && existing.discountCents !== manualDiscount) || existing.discountReason !== discountReason || existing.voucherCode !== (data.voucherCode ?? null)) {
        throw new HttpError(409, "Dieser Zahlungsschl\u00fcssel wurde bereits verwendet.");
      }
      return { created: false, entry: existing };
    }
    const voucher = data.voucherCode ? await redeemVoucher(tx, tenantId(req), data.voucherCode, balance.booking.userId) : undefined;
    const discountCents = voucher?.discountCents ?? manualDiscount;
    const allowed = data.kind === "deposit"
      ? balance.booking.status === "confirmed" && data.amountCents <= balance.outstandingCents
      : balance.booking.status === "completed" && data.amountCents === balance.outstandingCents - discountCents;
    if (!allowed) throw new HttpError(409, "Zahlung passt nicht zum Terminstatus oder offenen Betrag.");
    const [entry] = await tx.insert(appointmentPayments).values({
      ...data, discountCents, discountReason, voucherId: voucher?.id, bookingId, actorId: req.identity!.id,
      providerReference: data.method === "simulated_card"
        ? simulatedAppointmentPayments.reference({ ...data, bookingId, currency: "EUR" }) : null,
    }).returning();
    return { created: true, entry };
  });
  res.status(result.created ? 201 : 200).json(result.entry);
});

appointmentPaymentsRouter.post(path + "/:paymentId/refunds", async (req, res) => {
  const bookingId = uuid(req.params.id);
  const paymentId = uuid(req.params.paymentId);
  const data = input(RecordAppointmentRefundBody.extend({ reason: z.string().trim().min(1).max(240) }).strict(), req.body);
  const result = await db.transaction(async (tx) => {
    const balance = await appointmentBalance(tx, tenantId(req), bookingId, true);
    const payment = balance.entries.find(({ id }) => id === paymentId);
    if (!payment) throw new HttpError(404, "Zahlung nicht gefunden.");
    const refunds = balance.refunds.filter((entry) => entry.paymentId === paymentId);
    const existing = refunds.find((entry) => entry.idempotencyKey === data.idempotencyKey);
    if (existing) {
      if (existing.amountCents !== data.amountCents || existing.reason !== data.reason) {
        throw new HttpError(409, "Dieser Erstattungsschl\u00fcssel wurde bereits verwendet.");
      }
      return { entry: existing, created: false };
    }
    const available = payment.amountCents - refunds.reduce((sum, entry) => sum + entry.amountCents, 0);
    if (balance.booking.status === "confirmed" || data.amountCents > available) {
      throw new HttpError(409, "Erstattung passt nicht zum Terminstatus oder erstattbaren Betrag.");
    }
    const [entry] = await tx.insert(appointmentRefunds).values({ ...data, paymentId, actorId: req.identity!.id }).returning();
    return { entry, created: true };
  });
  res.status(result.created ? 201 : 200).json(result.entry);
});

appointmentPaymentsRouter.get(path + "/:paymentId/receipt", async (req, res) => {
  const bookingId = uuid(req.params.id);
  const paymentId = uuid(req.params.paymentId);
  const data = await db.transaction(async (tx) => {
    const balance = await appointmentBalance(tx, tenantId(req), bookingId);
    const payment = balance.entries.find(({ id }) => id === paymentId);
    if (!payment) throw new HttpError(404, "Zahlung nicht gefunden.");
    const [location] = await tx.select({ name: locations.name, timezone: locations.timezone }).from(locations)
      .where(eq(locations.id, balance.booking.locationId));
    return { payment, location: location!, refunds: balance.refunds.filter((entry) => entry.paymentId === paymentId) };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  const { payment, location, refunds } = data;
  const currency = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
  const date = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: location.timezone });
  const lines = [
    "BeautyHub - Zahlungsnachweis (Entwicklung)",
    location.name,
    "Termin " + bookingId, "Zahlung " + paymentId, date.format(payment.createdAt),
    (payment.kind === "deposit" ? "Anzahlung" : "Restzahlung") + " " + currency.format(payment.amountCents / 100),
    ...(payment.discountCents > 0 ? ["Rabatt " + currency.format(payment.discountCents / 100)] : []),
    payment.method === "cash" ? "Bar erfasst" : "Simulierte Kartenzahlung",
    ...refunds.map((refund) => "Erstattung " + refund.id + " | " + date.format(refund.createdAt) + " | " + currency.format(refund.amountCents / 100)),
    "Interner Zahlungsnachweis - kein Steuerbeleg.",
  ];
  res.set("Cache-Control", "no-store").attachment("beautyhub-zahlung-" + paymentId + ".txt").type("text/plain").send(lines.join("\r\n"));
});

const retailPath = "/organizations/:organizationId/locations/:locationId/retail-sales";
appointmentPaymentsRouter.use(retailPath, requireAuthentication, requireOrganization, allowRoles("owner", "manager"));

const saleScope = (locationId: string, organizationId: string) =>
  and(eq(locations.id, locationId), eq(locations.organizationId, organizationId));

appointmentPaymentsRouter.post(retailPath, async (req, res) => {
  const locationId = uuid(req.params.locationId);
  const organizationId = tenantId(req);
  const data = input(z.strictObject({
    idempotencyKey: z.uuid(), voucherCode: voucherCodeInput.optional(),
    method: z.enum(["cash", "simulated_card"]),
    items: z.array(z.strictObject({
      productId: z.uuid().optional(),
      description: z.string().trim().min(1).max(120).regex(/^[^\r\n]+$/),
      unitCents: z.number().int().positive().max(10_000_000),
      quantity: z.number().int().positive().max(100),
    })).min(1).max(20),
  }), req.body);
  const subtotal = data.items.reduce((sum, row) => sum + row.unitCents * row.quantity, 0);
  if (subtotal > 2147483647) throw new HttpError(400, "Der Gesamtbetrag ist zu hoch.");
  const result = await db.transaction(async (tx) => {
    const [location] = await tx.select({ id: locations.id }).from(locations).where(saleScope(locationId, organizationId)).for("update");
    if (!location) throw new HttpError(404, "Standort nicht gefunden.");
    const [existing] = await tx.select().from(retailSales).where(and(
      eq(retailSales.locationId, locationId), eq(retailSales.idempotencyKey, data.idempotencyKey),
    ));
    if (existing) {
      if (existing.method !== data.method || existing.voucherCode !== (data.voucherCode ?? null) || existing.items.length !== data.items.length ||
        existing.items.some((row, index) => row.productId !== data.items[index]?.productId ||
          (!row.productId && row.description !== data.items[index]?.description) ||
          row.quantity !== data.items[index]?.quantity || row.unitCents !== data.items[index]?.unitCents)) {
        throw new HttpError(409, "Dieser Verkaufsschl\u00fcssel wurde bereits verwendet.");
      }
      return { created: false, sale: existing };
    }
    const quantities = new Map<string, number>();
    for (const item of data.items) {
      if (item.productId) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    }
    const products = quantities.size ? await tx.select().from(inventoryProducts).where(and(
      eq(inventoryProducts.locationId, locationId), inArray(inventoryProducts.id, [...quantities.keys()]),
    )).orderBy(inventoryProducts.id).for("update") : [];
    const catalog = new Map(products.map((product) => [product.id, product]));
    const items = data.items.map((item) => {
      if (!item.productId) return item;
      const product = catalog.get(item.productId);
      if (!product || product.archived || product.unitCents !== item.unitCents || product.stock < quantities.get(item.productId)!) {
        throw new HttpError(409, "Preis oder Bestand hat sich geaendert. Bitte pruefe die Artikelauswahl.");
      }
      return { ...item, description: product.name, sku: product.sku };
    });
    const voucher = data.voucherCode ? await redeemVoucher(tx, organizationId, data.voucherCode) : undefined;
    const discountCents = voucher?.discountCents ?? 0;
    const amountCents = subtotal - discountCents;
    if (amountCents <= 0) throw new HttpError(409, "Der Gutschein muss kleiner als der Warenwert sein.");
    const [sale] = await tx.insert(retailSales).values({ ...data, items, discountCents, voucherId: voucher?.id, amountCents, locationId, actorId: req.identity!.id }).returning();
    for (const product of products) {
      const sold = quantities.get(product.id)!;
      const balance = product.stock - sold;
      await tx.update(inventoryProducts).set({ stock: balance }).where(eq(inventoryProducts.id, product.id));
      await tx.insert(inventoryMovements).values({ productId: product.id, actorId: req.identity!.id,
        idempotencyKey: sale!.id, kind: "sale", quantity: -sold, balance, reason: "Verkauf " + sale!.id });
    }
    return { created: true, sale };
  });
  res.set("Cache-Control", "no-store").status(result.created ? 201 : 200).json(result.sale);
});

async function retailBalance(tx: BookingTransaction, locationId: string, organizationId: string, saleId: string, lock = false) {
  const query = tx.select({ sale: retailSales, name: locations.name, timezone: locations.timezone })
    .from(retailSales).innerJoin(locations, eq(locations.id, retailSales.locationId))
    .where(and(saleScope(locationId, organizationId), eq(retailSales.id, saleId)));
  const [row] = await (lock ? query.for("update", { of: retailSales }) : query);
  if (!row) throw new HttpError(404, "Verkauf nicht gefunden.");
  const refunds = await tx.select().from(retailRefunds).where(eq(retailRefunds.saleId, saleId))
    .orderBy(desc(retailRefunds.createdAt), desc(retailRefunds.id));
  return { ...row, refunds, refundableCents: row.sale.amountCents - refunds.reduce((sum, item) => sum + item.amountCents, 0) };
}

const salePath = retailPath + "/:saleId";
appointmentPaymentsRouter.get(salePath, async (req, res) => {
  const { sale, refunds, refundableCents } = await db.transaction(
    (tx) => retailBalance(tx, uuid(req.params.locationId), tenantId(req), uuid(req.params.saleId)),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
  res.set("Cache-Control", "no-store").json({ sale, refunds, refundableCents });
});

appointmentPaymentsRouter.post(salePath + "/refunds", async (req, res) => {
  const saleId = uuid(req.params.saleId);
  const data = input(RecordAppointmentRefundBody.extend({ reason: z.string().trim().min(1).max(240) }).strict(), req.body);
  const result = await db.transaction(async (tx) => {
    const balance = await retailBalance(tx, uuid(req.params.locationId), tenantId(req), saleId, true);
    const existing = balance.refunds.find((row) => row.idempotencyKey === data.idempotencyKey);
    if (existing) {
      if (existing.amountCents !== data.amountCents || existing.reason !== data.reason) {
        throw new HttpError(409, "Dieser Erstattungsschl\u00fcssel wurde bereits verwendet.");
      }
      return { entry: existing, created: false };
    }
    if (data.amountCents > balance.refundableCents) throw new HttpError(409, "Erstattung \u00fcberschreitet den verf\u00fcgbaren Betrag.");
    const [entry] = await tx.insert(retailRefunds).values({ ...data, saleId, actorId: req.identity!.id }).returning();
    return { entry, created: true };
  });
  res.set("Cache-Control", "no-store").status(result.created ? 201 : 200).json(result.entry);
});

appointmentPaymentsRouter.get(salePath + "/receipt", async (req, res) => {
  const { sale, name, timezone, refunds, refundableCents } = await db.transaction(
    (tx) => retailBalance(tx, uuid(req.params.locationId), tenantId(req), uuid(req.params.saleId)),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
  const currency = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
  const date = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: timezone });
  const lines = ["BeautyHub - Verkaufsnachweis (Entwicklung)", name, "Verkauf " + sale.id, date.format(sale.createdAt),
    ...sale.items.map((item) => item.description + " | " + item.quantity + " x " + currency.format(item.unitCents / 100)),
    ...(sale.discountCents > 0 ? ["Gutscheinrabatt " + currency.format(sale.discountCents / 100)] : []),
    "Gesamtbetrag " + currency.format(sale.amountCents / 100),
    sale.method === "cash" ? "Bar erfasst" : "Simulierte Kartenzahlung",
    ...refunds.map((refund) => "Erstattung " + refund.id + " | " + date.format(refund.createdAt) + " | " + currency.format(refund.amountCents / 100)),
    "Nach Erstattungen " + currency.format(refundableCents / 100),
    "Interner Zahlungsnachweis - kein Steuerbeleg."];
  res.set("Cache-Control", "no-store").attachment("beautyhub-verkauf-" + sale.id + ".txt").type("text/plain").send(lines.join("\r\n"));
});
