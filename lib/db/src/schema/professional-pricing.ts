import { sql } from "drizzle-orm";
import { check, integer, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { services } from "./catalog";
import { employees, serviceVariants } from "./operations";

export const professionalPrices = pgTable("professional_prices", {
  id: uuid("id").defaultRandom().primaryKey(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  variantId: uuid("variant_id").references(() => serviceVariants.id, { onDelete: "cascade" }),
  priceCents: integer("price_cents"),
  durationMinutes: integer("duration_minutes"),
}, (t) => [
  uniqueIndex("professional_price_base").on(t.employeeId, t.serviceId).where(sql`${t.variantId} is null`),
  uniqueIndex("professional_price_variant").on(t.employeeId, t.serviceId, t.variantId).where(sql`${t.variantId} is not null`),
  check("professional_price_bounds", sql`(${t.priceCents} between 0 and 10000000 or ${t.priceCents} is null)
    and (${t.durationMinutes} between 1 and 720 or ${t.durationMinutes} is null)`),
]);
