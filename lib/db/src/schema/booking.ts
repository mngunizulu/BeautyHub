import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { locations, services } from "./catalog";
import { users } from "./identity";
import { cancellationPolicies, employees, paymentReferences } from "./operations";

export interface BookingLine {
  employeeId?: string;
  professionalName?: string;
  serviceId: string;
  variantId: string | null;
  name: string;
  variantName: string | null;
  priceCents: number;
  durationMinutes: number;
  preparationMinutes: number;
  cleanupMinutes: number;
}

export const reservations = pgTable("bookings", {
  id: uuid("id").defaultRandom().primaryKey(),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  employeeId: uuid("employee_id").notNull().references(() => employees.id),
  userId: uuid("user_id").references(() => users.id),
  guestName: text("guest_name"),
  appointmentNote: text("appointment_note"),
  source: text("source", { enum: ["online", "manual", "walk_in"] }).notNull().default("online"),
  paymentMethodId: uuid("payment_method_id").references(() => paymentReferences.id),
  idempotencyKey: uuid("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: text("status", { enum: ["confirmed", "cancelled", "completed", "no_show"] }).notNull().default("confirmed"),
  items: jsonb("items").$type<BookingLine[]>().notNull(),
  priceCents: integer("price_cents").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  policyVersion: integer("policy_version").notNull(),
  policyNoticeHours: integer("policy_notice_hours").notNull(),
  policySnapshot: jsonb("policy_snapshot").$type<typeof cancellationPolicies.$inferSelect>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique("booking_customer_idempotency_unique").on(t.userId, t.idempotencyKey),
  uniqueIndex("booking_guest_idempotency_unique").on(t.locationId, t.idempotencyKey).where(sql`${t.userId} is null`),
  check("booking_customer_or_guest", sql`(${t.source} = 'online' and ${t.userId} is not null and ${t.guestName} is null)
    or (${t.source} in ('manual', 'walk_in') and ${t.userId} is null and ${t.guestName} is not null and ${t.paymentMethodId} is null)`),
  index("booking_location_start_idx").on(t.locationId, t.startsAt),
  check("booking_valid_interval", sql`${t.startsAt} < ${t.endsAt}`),
  check("booking_valid_status", sql`${t.status} in ('confirmed', 'cancelled', 'completed', 'no_show')`),
]);

export const bookingStaffReservations = pgTable("booking_staff_reservations", {
  bookingId: uuid("booking_id").notNull().references(() => reservations.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.bookingId, t.position] }),
  check("booking_staff_valid_interval", sql`${t.startsAt} < ${t.endsAt}`),
]);

export const hiddenBookingStarts = pgTable("hidden_booking_starts", {
  locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
}, (table) => [primaryKey({ columns: [table.locationId, table.serviceId, table.startsAt] })]);

export const bookingBlocks = pgTable("booking_blocks", {
  id: uuid("id").defaultRandom().primaryKey(),
  locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "cascade" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  reason: text("reason").notNull(),
}, (t) => [index("booking_blocks_location_idx").on(t.locationId, t.startsAt), check("booking_block_valid_interval", sql`${t.startsAt} < ${t.endsAt}`)]);

export const bookingResources = pgTable("booking_resources", {
  id: uuid("id").defaultRandom().primaryKey(),
  locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
}, (t) => [index("booking_resources_location_idx").on(t.locationId)]);

export const bookingServiceResources = pgTable("booking_service_resources", {
  serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  resourceId: uuid("resource_id").notNull().references(() => bookingResources.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.serviceId, t.resourceId] })]);

export const bookingResourceReservations = pgTable("booking_resource_reservations", {
  bookingId: uuid("booking_id").notNull().references(() => reservations.id, { onDelete: "cascade" }),
  resourceId: uuid("resource_id").notNull().references(() => bookingResources.id),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
}, (t) => [primaryKey({ columns: [t.bookingId, t.resourceId] })]);

export const bookingEvents = pgTable("booking_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  bookingId: uuid("booking_id").notNull().references(() => reservations.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["confirmed", "cancelled", "rescheduled", "completed", "no_show", "reminder", "follow_up"] }).notNull(),
  estimatedFeeCents: integer("estimated_fee_cents"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("booking_events_booking_idx").on(t.bookingId, t.createdAt)]);

export const bookingWaitlist = pgTable("booking_waitlist", {
  locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.locationId, t.userId, t.date] })]);
