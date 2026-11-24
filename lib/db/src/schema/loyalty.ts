import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, unique, uuid } from "drizzle-orm/pg-core";
import { reservations } from "./booking";
import { posVouchers } from "./pos";
import { organizations, users } from "./identity";

export const loyaltyPrograms = pgTable("loyalty_programs", {
  organizationId: uuid("organization_id").primaryKey().references(() => organizations.id, { onDelete: "cascade" }),
  pointsPerVisit: integer("points_per_visit").notNull(),
}, (table) => [
  check("loyalty_program_points", sql`${table.pointsPerVisit} between 0 and 1000`),
]);

export const loyaltyAwards = pgTable("loyalty_awards", {
  bookingId: uuid("booking_id").primaryKey().references(() => reservations.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  points: integer("points").notNull(),
}, (table) => [
  check("loyalty_award_points", sql`${table.points} between 1 and 1000`),
  index("loyalty_awards_user_organization").on(table.userId, table.organizationId),
]);

export const loyaltyRedemptions = pgTable("loyalty_redemptions", {
  voucherId: uuid("voucher_id").primaryKey().references(() => posVouchers.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  requestId: uuid("request_id").notNull(),
  points: integer("points").notNull(),
}, (table) => [
  unique("loyalty_redemption_request").on(table.userId, table.organizationId, table.requestId),
  check("loyalty_redemption_points", sql`${table.points} > 0`),
]);
