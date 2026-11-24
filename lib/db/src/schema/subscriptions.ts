import { sql } from "drizzle-orm";
import { check, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./identity";

export const saasPlans = pgTable("saas_plans", {
  code: text("code", { enum: ["starter", "professional", "enterprise"] }).primaryKey(),
  name: text("name").notNull(),
  monthlyCents: integer("monthly_cents").notNull(),
  locationLimit: integer("location_limit").notNull(),
  trialDays: integer("trial_days").notNull(),
}, (t) => [
  check("saas_plan_values", sql`${t.monthlyCents} between 0 and 10000000 and ${t.locationLimit} between 1 and 1000 and ${t.trialDays} between 0 and 90`),
]);

export const saasSubscriptions = pgTable("saas_subscriptions", {
  organizationId: uuid("organization_id").primaryKey().references(() => organizations.id, { onDelete: "cascade" }),
  planCode: text("plan_code").notNull().references(() => saasPlans.code),
  state: text("state", { enum: ["trial", "active", "cancelled"] }).notNull(),
  periodEndsAt: timestamp("period_ends_at", { withTimezone: true }).notNull(),
}, (t) => [check("saas_subscription_state", sql`${t.state} in ('trial', 'active', 'cancelled')`)]);

export const saasChanges = pgTable("saas_changes", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  requestId: uuid("request_id").notNull(),
  planCode: text("plan_code").notNull().references(() => saasPlans.code),
  action: text("action", { enum: ["trial", "activate", "cancel"] }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  periodEndsAt: timestamp("period_ends_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.organizationId, t.requestId] }),
  check("saas_change_values", sql`${t.action} in ('trial', 'activate', 'cancel') and ${t.amountCents} >= 0`),
]);
