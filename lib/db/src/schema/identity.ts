import { pgTable, text, uuid, timestamp, uniqueIndex, boolean, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

// Identity comes from a verified managed provider, never a browser-supplied role.
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  externalIdentityId: text("external_identity_id").notNull().unique(),
  email: text("email").notNull().default(""),
  emailVerified: boolean("email_verified").notNull().default(false),
  displayName: text("display_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  emailNotifications: boolean("email_notifications").notNull().default(true),
  marketingConsent: boolean("marketing_consent").notNull().default(false),
  deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  isDemo: boolean("is_demo").notNull().default(false),
  description: text("description").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  website: text("website").notNull().default(""),
  onboardingStep: text("onboarding_step").notNull().default("1"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable("business_memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["owner", "manager", "employee"] }).notNull(),
  status: text("status", { enum: ["active", "inactive", "removed"] }).notNull().default("active"),
}, (table) => [
  uniqueIndex("membership_user_organization_unique").on(table.userId, table.organizationId),
  check("membership_role_allowed", sql`${table.role} in ('owner', 'manager', 'employee')`),
  check("membership_status_allowed", sql`${table.status} in ('active', 'inactive', 'removed')`),
]);

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertOrganizationSchema = createInsertSchema(organizations).omit({ id: true, createdAt: true });
export const insertMembershipSchema = createInsertSchema(memberships).omit({ id: true });
export type User = typeof users.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
