import { customType, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { reservations } from "./booking";
import { organizations } from "./identity";

export const crmCustomers = pgTable("crm_customers", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  contactPreference: text("contact_preference", { enum: ["none", "phone", "email"] }).notNull().default("none"),
  notes: text("notes").notNull().default(""),
  tags: text("tags").array().notNull(),
  revision: integer("revision").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("crm_customers_tenant_name_idx").on(t.organizationId, t.name)]);

export const crmAppointmentLinks = pgTable("crm_appointment_links", {
  bookingId: uuid("booking_id").primaryKey().references(() => reservations.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").notNull().references(() => crmCustomers.id, { onDelete: "cascade" }),
}, (t) => [index("crm_appointment_customer_idx").on(t.customerId)]);

const bytes = customType<{ data: Buffer }>({ dataType: () => "bytea" });

export const crmAttachments = pgTable("crm_attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerId: uuid("customer_id").notNull().references(() => crmCustomers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  content: bytes("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("crm_attachment_customer_idx").on(t.customerId)]);
