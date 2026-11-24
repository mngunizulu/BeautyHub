import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { employees } from "./operations";

export const staffBreaks = pgTable("staff_breaks", {
  id: uuid("id").defaultRandom().primaryKey(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  weekday: integer("weekday").notNull(),
  begins: text("begins").notNull(),
  ends: text("ends").notNull(),
}, (t) => [
  index("staff_break_employee_day_idx").on(t.employeeId, t.weekday),
  check("staff_break_valid", sql`${t.weekday} between 1 and 7
    and ${t.begins} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and ${t.ends} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and ${t.begins} < ${t.ends}`),
]);
