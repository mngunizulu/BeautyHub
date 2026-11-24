import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { reservations } from "./booking";
import { users } from "./identity";

export const bookingReviews = pgTable("booking_reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  bookingId: uuid("booking_id").notNull().unique().references(() => reservations.id),
  rating: integer("rating").notNull(),
  comment: text("comment").notNull().default(""),
  reply: text("reply").notNull().default(""),
  hiddenByModerator: boolean("hidden_by_moderator").notNull().default(false),
  published: timestamp("published", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("booking_review_rating", sql`${table.rating} between 1 and 5`),
]);

export const bookingReviewReports = pgTable("booking_review_reports", {
  reviewId: uuid("review_id").notNull().references(() => bookingReviews.id, { onDelete: "cascade" }),
  reporterId: uuid("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason", { enum: ["spam", "abuse", "personal_information", "other"] }).notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  details: text("details").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.reviewId, table.reporterId] }),
  check("booking_review_report_reason", sql`${table.reason} in ('spam', 'abuse', 'personal_information', 'other')`),
]);
