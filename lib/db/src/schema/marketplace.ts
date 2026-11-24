import { customType, index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { locations } from "./catalog";
import { users } from "./identity";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

export const galleryPhotos = pgTable("gallery_photos", {
  id: uuid("id").defaultRandom().primaryKey(),
  locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  alt: text("alt").notNull(),
  mime: text("mime").notNull(),
  content: bytea("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("gallery_photos_location_idx").on(t.locationId)]);

export const favorites = pgTable("favorites", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.locationId] }), index("favorites_location_idx").on(t.locationId)]);
