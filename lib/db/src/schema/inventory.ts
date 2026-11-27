import { sql } from "drizzle-orm";
import { boolean, check, integer, jsonb, pgTable, text, timestamp, unique, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { galleryPhotos } from "./marketplace";
import { locations } from "./catalog";
import { users } from "./identity";

export const inventoryProducts = pgTable("inventory_products", {
  id: uuid("id").defaultRandom().primaryKey(),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default(""),
  supplier: text("supplier").notNull().default(""),
  photoId: uuid("photo_id").references((): AnyPgColumn => galleryPhotos.id, { onDelete: "set null" }),
  imageUrl: text("image_url").notNull().default(""),
  purchaseCostCents: integer("purchase_cost_cents"),
  unitCents: integer("unit_cents").notNull(),
  stock: integer("stock").notNull().default(0),
  reorderAt: integer("reorder_at").notNull().default(0),
  archived: boolean("archived").notNull().default(false),
}, (t) => [
  unique("inventory_location_sku_unique").on(t.locationId, t.sku),
  check("inventory_product_values", sql`${t.unitCents} > 0 and (${t.purchaseCostCents} is null or ${t.purchaseCostCents} between 0 and 10000000) and ${t.stock} >= 0 and ${t.reorderAt} >= 0`),
]);

export const inventoryMovements = pgTable("inventory_movements", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => inventoryProducts.id),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  idempotencyKey: uuid("idempotency_key").notNull(),
  kind: text("kind", { enum: ["receipt", "adjustment", "sale"] }).notNull(),
  quantity: integer("quantity").notNull(),
  balance: integer("balance").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique("inventory_movement_request_unique").on(t.productId, t.idempotencyKey),
  check("inventory_movement_values", sql`${t.balance} >= 0 and
    ((${t.kind} = 'receipt' and ${t.quantity} > 0) or (${t.kind} = 'adjustment' and ${t.quantity} <> 0) or (${t.kind} = 'sale' and ${t.quantity} < 0))`),
]);

export const inventorySuppliers = pgTable("inventory_suppliers", {
  id: uuid("id").defaultRandom().primaryKey(),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  name: text("name").notNull(),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
}, (t) => [unique("inventory_supplier_location_name_unique").on(t.locationId, t.name)]);

export interface PurchaseOrderLine {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  receivedQuantity?: number;
  purchaseCostCents?: number | null;
}

export const inventoryOrders = pgTable("inventory_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  supplierId: uuid("supplier_id").notNull().references(() => inventorySuppliers.id),
  supplierName: text("supplier_name").notNull(),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  idempotencyKey: uuid("idempotency_key").notNull(),
  items: jsonb("items").$type<PurchaseOrderLine[]>().notNull(),
  status: text("status", { enum: ["open", "received", "cancelled"] }).notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
}, (t) => [
  unique("inventory_order_request_unique").on(t.locationId, t.idempotencyKey),
  check("inventory_order_status", sql`(${t.status} = 'open' and ${t.closedAt} is null)
    or (${t.status} in ('received', 'cancelled') and ${t.closedAt} is not null)`),
]);

export const inventoryOrderReceipts = pgTable("inventory_order_receipts", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => inventoryOrders.id),
  idempotencyKey: uuid("idempotency_key").notNull(),
  items: jsonb("items").$type<{ productId: string; quantity: number }[]>().notNull(),
}, (t) => [unique("inventory_order_receipt_request_unique").on(t.orderId, t.idempotencyKey)]);
