import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { bookingEvents } from "./booking";

export interface BookingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  calendar: string;
}

export const bookingNotifications = pgTable("booking_notifications", {
  eventId: uuid("event_id").primaryKey().references(() => bookingEvents.id, { onDelete: "cascade" }),
  payload: jsonb("payload").$type<BookingEmail>().notNull(),
  status: text("status", { enum: ["pending", "delivered", "failed"] }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
}, (table) => [index("booking_notifications_ready_idx").on(table.status, table.availableAt)]);
