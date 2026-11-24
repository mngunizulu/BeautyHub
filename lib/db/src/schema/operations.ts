import { sql } from "drizzle-orm";
import { pgTable, text, uuid, integer, timestamp, boolean, jsonb, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity";
import { locations, services } from "./catalog";

export interface ScheduleHour { weekday: number; opens: string; closes: string }
export const employees = pgTable("employees", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  userId: uuid("user_id").references(() => users.id),
  displayName: text("display_name").notNull(),
  publicName: text("public_name").notNull().default(""),
  professionalTitle: text("professional_title").notNull().default(""),
  professionalPhotoUrl: text("professional_photo_url").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  active: boolean("active").notNull().default(true),
  workingHours: jsonb("working_hours").$type<ScheduleHour[]>().notNull().default([]),
}, (t) => [index("employees_tenant_idx").on(t.organizationId)]);

export const employeeServices = pgTable("employee_services", {
  id: uuid("id").defaultRandom().primaryKey(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id),
  serviceId: uuid("service_id").notNull().references(() => services.id),
}, (t) => [uniqueIndex("employee_service_unique").on(t.employeeId, t.serviceId)]);

export const serviceVariants = pgTable("service_variants", {
  id: uuid("id").defaultRandom().primaryKey(),
  serviceId: uuid("service_id").notNull().references(() => services.id),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  archived: boolean("archived").notNull().default(false),
}, (t) => [check("variant_valid_money_duration", sql`${t.priceCents} >= 0 and ${t.durationMinutes} > 0`)]);

export const cancellationPolicies = pgTable("cancellation_policies", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  version: integer("version").notNull().default(1),
  rescheduleNoticeHours: integer("reschedule_notice_hours").notNull().default(0),
  noticeHours: integer("notice_hours").notNull().default(24),
  lateFeeType: text("late_fee_type", { enum: ["percentage", "fixed"] }).notNull().default("percentage"),
  lateFeeValue: integer("late_fee_value").notNull().default(100),
  noShowFeeType: text("no_show_fee_type", { enum: ["percentage", "fixed"] }).notNull().default("percentage"),
  noShowFeeValue: integer("no_show_fee_value").notNull().default(100),
  waiverAllowed: boolean("waiver_allowed").notNull().default(true),
  exceptions: text("exceptions").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("policy_tenant_version_unique").on(t.organizationId, t.version),
  check("policy_valid_values", sql`${t.rescheduleNoticeHours} between 0 and 720 and ${t.noticeHours} >= 0 and ${t.lateFeeValue} >= 0 and ${t.noShowFeeValue} >= 0 and ${t.lateFeeType} in ('percentage','fixed') and ${t.noShowFeeType} in ('percentage','fixed') and (${t.lateFeeType} <> 'percentage' or ${t.lateFeeValue} <= 100) and (${t.noShowFeeType} <> 'percentage' or ${t.noShowFeeValue} <= 100)`),
]);

// Reserved for explicit future booking-policy acceptance; never implicit consent.
export const policyAcceptances = pgTable("policy_acceptances", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  policyId: uuid("policy_id").notNull().references(() => cancellationPolicies.id),
  snapshot: jsonb("snapshot").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const staffInvitations = pgTable("staff_invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  email: text("email").notNull(),
  role: text("role", { enum: ["manager", "employee"] }).notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdBy: uuid("created_by").notNull().references(() => users.id),
}, (t) => [index("invitations_tenant_idx").on(t.organizationId),
  check("invitation_role_allowed", sql`${t.role} in ('manager','employee')`)]);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  targetId: text("target_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Opaque provider IDs only. No PAN, CVV, expiry, or card-entry API exists.
export const paymentReferences = pgTable("payment_provider_references", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  provider: text("provider").notNull(),
  providerCustomerId: text("provider_customer_id").notNull(),
  status: text("status").notNull().default("pending"),
}, (t) => [uniqueIndex("payment_user_provider_unique").on(t.userId, t.provider)]);
