import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

export const supportCases = pgTable("support_cases", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerId: uuid("customer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  state: text("state", { enum: ["open", "resolved"] }).notNull().default("open"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("support_case_customer").on(t.customerId, t.updatedAt),
  index("support_case_queue").on(t.state, t.updatedAt),
  check("support_case_state", sql`${t.state} in ('open', 'resolved')`),
]);

export const supportMessages = pgTable("support_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull().references(() => supportCases.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  kind: text("kind", { enum: ["customer", "staff", "resolved", "reopened"] }).notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("support_message_case").on(t.caseId, t.createdAt),
  check("support_message_kind", sql`${t.kind} in ('customer', 'staff', 'resolved', 'reopened')`),
]);
