import { and, eq, ilike, or, sql, asc } from "drizzle-orm";
import { db, categories, locations, organizations, services, openingHours } from "@workspace/db";

const publicFields = {
  id: locations.id,
  slug: locations.slug,
  name: locations.name,
  description: locations.description,
  city: locations.city,
  district: locations.district,
  address: locations.address,
  postalCode: locations.postalCode,
  categorySlug: categories.slug,
  categoryName: categories.name,
  imageKey: locations.imageKey,
  timezone: locations.timezone,
  isDemo: organizations.isDemo,
  minPriceCents: sql<number | null>`(select min(s.price_cents) from services s where s.location_id = ${locations.id} and s.published = true)`,
  serviceCount: sql<number>`(select count(*)::int from services s where s.location_id = ${locations.id} and s.published = true)`,
};

// LIKE patterns are escaped in addition to parameter binding so input is literal.
export function literalPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

export async function findPublicBusinesses(filters: { q?: string; city?: string; category?: string } = {}) {
  return db.select(publicFields).from(locations)
    .innerJoin(categories, eq(locations.categoryId, categories.id))
    .innerJoin(organizations, eq(locations.organizationId, organizations.id))
    .where(and(
      eq(locations.published, true),
      filters.q ? or(
        ilike(locations.name, literalPattern(filters.q)),
        ilike(locations.description, literalPattern(filters.q)),
        sql`exists (select 1 from services s where s.location_id = ${locations.id} and s.published = true and s.name ilike ${literalPattern(filters.q)})`,
      ) : undefined,
      filters.city ? ilike(locations.city, literalPattern(filters.city)) : undefined,
      filters.category ? eq(categories.slug, filters.category) : undefined,
    ))
    .orderBy(asc(locations.name)).limit(100);
}

export async function findPublicBusiness(slug: string) {
  const [business] = await db.select(publicFields).from(locations)
    .innerJoin(categories, eq(locations.categoryId, categories.id))
    .innerJoin(organizations, eq(locations.organizationId, organizations.id))
    .where(and(eq(locations.slug, slug), eq(locations.published, true))).limit(1);
  if (!business) return null;
  const [catalog, hours] = await Promise.all([
    db.select({
      id: services.id, name: services.name, description: services.description,
      durationMinutes: services.durationMinutes, priceCents: services.priceCents,
    }).from(services).where(and(eq(services.locationId, business.id), eq(services.published, true))).orderBy(asc(services.priceCents)),
    db.select({ weekday: openingHours.weekday, opens: openingHours.opens, closes: openingHours.closes })
      .from(openingHours).where(eq(openingHours.locationId, business.id)).orderBy(asc(openingHours.weekday)),
  ]);
  const weekdays = ["", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
  return { ...business, services: catalog, openingHours: hours.map((hour) => ({
    day: weekdays[hour.weekday]!, opens: hour.opens, closes: hour.closes,
  })) };
}

export async function findCategories() {
  return db.select({
    id: categories.id, slug: categories.slug, name: categories.name,
    businessCount: sql<number>`count(${locations.id})::int`,
  }).from(categories)
    .leftJoin(locations, and(eq(locations.categoryId, categories.id), eq(locations.published, true)))
    .groupBy(categories.id).orderBy(asc(categories.sortOrder));
}

export async function catalogSummary() {
  const [counts] = await db.select({
    businessCount: sql<number>`count(*)::int`,
  }).from(locations).where(eq(locations.published, true));
  const [serviceCounts] = await db.select({ count: sql<number>`count(*)::int` })
    .from(services).innerJoin(locations, eq(services.locationId, locations.id))
    .where(and(eq(locations.published, true), eq(services.published, true)));
  const [categoryCounts] = await db.select({ count: sql<number>`count(*)::int` }).from(categories);
  const cities = await db.selectDistinct({ city: locations.city }).from(locations)
    .where(eq(locations.published, true)).orderBy(asc(locations.city));
  const [demo] = await db.select({
    isDemo: sql<boolean>`coalesce(bool_and(${organizations.isDemo}), false)`,
  }).from(locations).innerJoin(organizations, eq(locations.organizationId, organizations.id))
    .where(eq(locations.published, true));
  return {
    businessCount: counts?.businessCount ?? 0,
    serviceCount: serviceCounts?.count ?? 0,
    categoryCount: categoryCounts?.count ?? 0,
    cities: cities.map((item) => item.city),
    isDemo: demo?.isDemo ?? false,
  };
}
