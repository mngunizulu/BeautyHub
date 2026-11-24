import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { reservations } from "./booking";
import { services } from "./catalog";
import { organizations, users } from "./identity";

export const servicePackages = pgTable("service_packages", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  serviceId: uuid("service_id").notNull().references(() => services.id),
  kind: text("kind", { enum: ["package", "membership"] }).notNull().default("package"),
  name: text("name").notNull(),
  visits: integer("visits").notNull(),
  priceCents: integer("price_cents").notNull(),
  validDays: integer("valid_days").notNull(),
  active: boolean("active").notNull().default(true),
}, (table) => [
  index("service_package_business").on(table.organizationId),
  check("service_package_kind", sql`${table.kind} in ('package', 'membership')`),
  check("service_package_terms", sql`${table.visits} between 2 and 50 and ${table.priceCents} > 0 and ${table.validDays} between 1 and 730`),
]);

export const customerPackages = pgTable("customer_packages", {
  id: uuid("id").defaultRandom().primaryKey(),
  packageId: uuid("package_id").notNull().references(() => servicePackages.id),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  requestId: uuid("request_id").notNull(),
  remaining: integer("remaining").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("customer_package_purchase_request").on(table.userId, table.requestId),
  check("customer_package_remaining", sql`${table.remaining} between 0 and 50`),
]);

export const packageUses = pgTable("package_uses", {
  bookingId: uuid("booking_id").primaryKey().references(() => reservations.id, { onDelete: "cascade" }),
  customerPackageId: uuid("customer_package_id").notNull().references(() => customerPackages.id),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  coveredCents: integer("covered_cents").notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("package_use_value", sql`${table.coveredCents} > 0`),
]);
