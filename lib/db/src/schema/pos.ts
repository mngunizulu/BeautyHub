import { sql } from "drizzle-orm";
import { boolean, check, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { reservations } from "./booking";
import { locations } from "./catalog";
import { organizations, users } from "./identity";

export const posVouchers = pgTable("pos_vouchers", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  code: text("code").notNull(),
  isGift: boolean("is_gift").notNull().default(false),
  loyaltyOnly: boolean("loyalty_only").notNull().default(false),
  discountCents: integer("discount_cents").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
}, (table) => [
  unique("pos_voucher_org_code_unique").on(table.organizationId, table.code),
  check("pos_voucher_positive", sql`${table.discountCents} > 0`),
]);

export const appointmentPayments = pgTable("appointment_payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  bookingId: uuid("booking_id").notNull().references(() => reservations.id),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  idempotencyKey: uuid("idempotency_key").notNull(),
  kind: text("kind", { enum: ["deposit", "settlement"] }).notNull(),
  method: text("method", { enum: ["cash", "simulated_card"] }).notNull(),
  voucherCode: text("voucher_code"),
  voucherId: uuid("voucher_id").unique().references(() => posVouchers.id),
  amountCents: integer("amount_cents").notNull(),
  discountCents: integer("discount_cents").notNull().default(0),
  discountReason: text("discount_reason"),
  providerReference: text("provider_reference"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("appointment_payment_request_unique").on(table.bookingId, table.idempotencyKey),
  check("appointment_payment_positive", sql`${table.amountCents} > 0`),
  check("appointment_payment_discount", sql`(${table.discountCents} = 0 and ${table.discountReason} is null)
    or (${table.kind} = 'settlement' and ${table.discountCents} > 0
      and ${table.discountReason} is not null and length(trim(${table.discountReason})) between 1 and 240)`),
  check("appointment_payment_kind", sql`${table.kind} in ('deposit', 'settlement')`),
  check("appointment_payment_method", sql`(${table.method} = 'cash' and ${table.providerReference} is null)
    or (${table.method} = 'simulated_card' and ${table.providerReference} is not null)`),
]);

export const appointmentRefunds = pgTable("appointment_refunds", {
  id: uuid("id").defaultRandom().primaryKey(),
  paymentId: uuid("payment_id").notNull().references(() => appointmentPayments.id),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  idempotencyKey: uuid("idempotency_key").notNull(),
  amountCents: integer("amount_cents").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("appointment_refund_request_unique").on(table.paymentId, table.idempotencyKey),
  check("appointment_refund_positive", sql`${table.amountCents} > 0`),
  check("appointment_refund_reason_length", sql`length(${table.reason}) between 1 and 240`),
]);

export interface RetailLine {
  productId?: string;
  sku?: string;
  description: string;
  unitCents: number;
  quantity: number;
}

export const retailSales = pgTable("retail_sales", {
  id: uuid("id").defaultRandom().primaryKey(),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  idempotencyKey: uuid("idempotency_key").notNull(),
  items: jsonb("items").$type<RetailLine[]>().notNull(),
  voucherCode: text("voucher_code"),
  voucherId: uuid("voucher_id").unique().references(() => posVouchers.id),
  discountCents: integer("discount_cents").notNull().default(0),
  amountCents: integer("amount_cents").notNull(),
  method: text("method", { enum: ["cash", "simulated_card"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("retail_sale_request_unique").on(table.locationId, table.idempotencyKey),
  check("retail_sale_positive", sql`${table.amountCents} > 0`),
  check("retail_sale_method", sql`${table.method} in ('cash', 'simulated_card')`),
]);

export const retailRefunds = pgTable("retail_refunds", {
  id: uuid("id").defaultRandom().primaryKey(),
  saleId: uuid("sale_id").notNull().references(() => retailSales.id),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  idempotencyKey: uuid("idempotency_key").notNull(),
  amountCents: integer("amount_cents").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("retail_refund_request_unique").on(table.saleId, table.idempotencyKey),
  check("retail_refund_positive", sql`${table.amountCents} > 0`),
  check("retail_refund_reason_length", sql`length(${table.reason}) between 1 and 240`),
]);
