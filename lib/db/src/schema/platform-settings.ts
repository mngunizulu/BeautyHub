import { sql } from "drizzle-orm";
import { boolean, check, integer, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

export type PlatformSettings = { businessRegistrationOpen: boolean; supportIntakeOpen: boolean };

export const platformSettings = pgTable("platform_settings", {
  id: integer("id").primaryKey(),
  businessRegistrationOpen: boolean("business_registration_open").notNull().default(true),
  supportIntakeOpen: boolean("support_intake_open").notNull().default(true),
}, (t) => [check("platform_settings_singleton", sql`${t.id} = 1`)]);

export const platformSettingChanges = pgTable("platform_setting_changes", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  previous: jsonb("previous").$type<PlatformSettings>().notNull(),
  current: jsonb("current").$type<PlatformSettings>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
