import { sql } from "drizzle-orm";
import { pgTable, primaryKey, text, uuid, integer, boolean, index, check, uniqueIndex, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { organizations } from "./identity";

export const categories = pgTable("service_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const organizationCategories = pgTable("organization_categories", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => categories.id),
}, (table) => [
  primaryKey({ columns: [table.organizationId, table.categoryId] }),
  index("organization_categories_category_idx").on(table.categoryId, table.organizationId),
]);

export const locations = pgTable("locations", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  categoryId: uuid("category_id").notNull().references(() => categories.id),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  city: text("city").notNull(),
  district: text("district").notNull(),
  address: text("address").notNull(),
  postalCode: text("postal_code").notNull(),
  country: text("country").notNull().default("DE"),
  street: text("street").notNull().default(""),
  houseNumber: text("house_number").notNull().default(""),
  addressExtra: text("address_extra").notNull().default(""),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  leadTimeHours: integer("lead_time_hours").notNull().default(2),
  advanceBookingDays: integer("advance_booking_days").notNull().default(90),
  contactPreference: text("contact_preference").notNull().default("email"),
  imageKey: text("image_key").notNull(),
  timezone: text("timezone").notNull().default("Europe/Berlin"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  published: boolean("published").notNull().default(false),
  differentialPricing: boolean("differential_pricing").notNull().default(false),
  allowProfessionalChoice: boolean("allow_professional_choice").notNull().default(true),
  allowAnyProfessional: boolean("allow_any_professional").notNull().default(true),
}, (table) => [
  check("location_professional_choice", sql`${table.allowProfessionalChoice} or ${table.allowAnyProfessional}`),
  index("locations_organization_idx").on(table.organizationId),
  index("locations_public_city_category_idx").on(table.published, table.city, table.categoryId),
]);

export const serviceGroups = pgTable("business_service_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
}, (table) => [uniqueIndex("service_group_name_unique").on(table.organizationId, table.name)]);

export const services = pgTable("services", {
  id: uuid("id").defaultRandom().primaryKey(),
  locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  priceCents: integer("price_cents").notNull(),
  published: boolean("published").notNull().default(false),
  categoryId: uuid("category_id").references(() => serviceGroups.id),
  preparationMinutes: integer("preparation_minutes").notNull().default(0),
  cleanupMinutes: integer("cleanup_minutes").notNull().default(0),
  onlineBooking: boolean("online_booking").notNull().default(true),
  archived: boolean("archived").notNull().default(false),
}, (table) => [
  index("services_location_idx").on(table.locationId),
  check("service_positive_duration", sql`${table.durationMinutes} > 0`),
  check("service_nonnegative_price", sql`${table.priceCents} >= 0`),
  check("service_nonnegative_buffers", sql`${table.preparationMinutes} >= 0 and ${table.cleanupMinutes} >= 0`),
]);

export const openingHours = pgTable("opening_hours", {
  id: uuid("id").defaultRandom().primaryKey(),
  locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  weekday: integer("weekday").notNull(),
  opens: text("opens").notNull(),
  closes: text("closes").notNull(),
}, (table) => [
  uniqueIndex("opening_hours_location_day_unique").on(table.locationId, table.weekday),
  check("opening_hours_weekday_range", sql`${table.weekday} between 1 and 7`),
  check("opening_hours_valid_time", sql`${table.opens} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${table.closes} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${table.opens} < ${table.closes}`),
]);

export const insertCategorySchema = createInsertSchema(categories).omit({ id: true });
export const insertLocationSchema = createInsertSchema(locations).omit({ id: true });
export const insertServiceSchema = createInsertSchema(services).omit({ id: true });
export const insertOpeningHourSchema = createInsertSchema(openingHours).omit({ id: true });
export type Category = typeof categories.$inferSelect;
export type Location = typeof locations.$inferSelect;
export type Service = typeof services.$inferSelect;
