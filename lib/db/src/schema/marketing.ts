import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity";

export const businessMarketingPreferences = pgTable("business_marketing_preferences", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  consent: boolean("consent").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.organizationId, t.userId] })]);

export const marketingCampaigns = pgTable("marketing_campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  title: text("title").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  segment: text("segment", { enum: ["completed", "repeat"] }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check("marketing_campaign_segment", sql`${t.segment} in ('completed', 'repeat')`)]);

export const marketingTemplates = pgTable("marketing_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  segment: text("segment", { enum: ["completed", "repeat"] }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check("marketing_template_segment", sql`${t.segment} in ('completed', 'repeat')`)]);

export const marketingCaptures = pgTable("marketing_captures", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => marketingCampaigns.id, { onDelete: "cascade" }),
  idempotencyKey: uuid("idempotency_key").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  count: integer("count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("marketing_capture_request_unique").on(t.campaignId, t.idempotencyKey)]);

export const marketingCapturedRecipients = pgTable("marketing_captured_recipients", {
  captureId: uuid("capture_id").notNull().references(() => marketingCaptures.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
}, (t) => [primaryKey({ columns: [t.captureId, t.userId] })]);
