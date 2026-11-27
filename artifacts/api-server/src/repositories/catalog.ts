import { publicLocation } from "../services/marketplace-visibility";
import { and, eq, exists, ilike, ne, or, sql, asc, desc, isNotNull } from "drizzle-orm";
import { db, bookingReviews, reservations, serviceGroups, categories, organizationCategories, locations, organizations, services, openingHours, serviceVariants, employees } from "@workspace/db";

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
  minPriceCents: sql<number | null>`(select min(s.price_cents) from services s where s.location_id = ${locations.id} and s.published = true and s.archived = false)`,
  serviceCount: sql<number>`(select count(*)::int from services s where s.location_id = ${locations.id} and s.published = true and s.archived = false)`,
};

// LIKE patterns are escaped in addition to parameter binding so input is literal.
export function literalPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

function hasPublicOffering(name?: string, maxPriceCents?: number) {
  const pattern = name ? literalPattern(name) : undefined;
  const baseName = pattern === undefined ? sql`true` : sql`s.name ilike ${pattern}`;
  const variantName = pattern === undefined ? sql`true` : sql`(${baseName} or v.name ilike ${pattern})`;
  const basePrice = maxPriceCents === undefined ? sql`true` : sql`s.price_cents <= ${maxPriceCents}`;
  const variantPrice = maxPriceCents === undefined ? sql`true` : sql`v.price_cents <= ${maxPriceCents}`;
  return sql`exists (
    select 1 from services s
    where s.location_id = ${locations.id} and s.published = true and s.archived = false
      and ((${baseName} and ${basePrice}) or exists (
        select 1 from service_variants v
        where v.service_id = s.id and v.archived = false and ${variantName} and ${variantPrice}
      ))
  )`;
}

const legacyCategorySlugs: ReadonlyMap<string, string> = new Map([["spa", "massage"], ["hautpflege", "kosmetik"]]);

function matchesCategory(slug: string) {
  const canonical = legacyCategorySlugs.get(slug) ?? slug;
  return or(eq(categories.slug, canonical), exists(
    db.select({ id: organizationCategories.categoryId }).from(organizationCategories)
      .innerJoin(categories, eq(organizationCategories.categoryId, categories.id))
      .where(and(eq(organizationCategories.organizationId, locations.organizationId), eq(categories.slug, canonical))),
  ));
}

export async function findPublicBusinesses(filters: {
  q?: string; city?: string; category?: string; service?: string; maxPriceCents?: number;
} = {}) {
  return db.select(publicFields).from(locations)
    .innerJoin(categories, eq(locations.categoryId, categories.id))
    .innerJoin(organizations, eq(locations.organizationId, organizations.id))
    .where(and(
      publicLocation,
      filters.q ? or(
        ilike(locations.name, literalPattern(filters.q)),
        ilike(locations.description, literalPattern(filters.q)),
        hasPublicOffering(filters.q),
      ) : undefined,
      filters.city ? ilike(locations.city, literalPattern(filters.city)) : undefined,
      filters.category ? matchesCategory(filters.category) : undefined,
      filters.service || filters.maxPriceCents !== undefined
        ? hasPublicOffering(filters.service, filters.maxPriceCents)
        : undefined,
    ))
    .orderBy(asc(locations.name)).limit(100);
}

export async function findPublicBusiness(slug: string) {
  const [business] = await db.select({ ...publicFields, addressExtra: locations.addressExtra, country: locations.country,
    latitude: locations.latitude, longitude: locations.longitude, phone: organizations.phone,
    website: organizations.website, socialUrl: organizations.socialUrl, logoUrl: organizations.logoUrl,
    verified: sql<boolean>`${organizations.verifiedAt} is not null`,
  }).from(locations)
    .innerJoin(categories, eq(locations.categoryId, categories.id))
    .innerJoin(organizations, eq(locations.organizationId, organizations.id))
    .where(and(eq(locations.slug, slug), publicLocation)).limit(1);
  if (!business) return null;
  const [catalog, hours, variants, staff] = await Promise.all([
    db.select({
      id: services.id, name: services.name, description: services.description, groupName: serviceGroups.name,
      durationMinutes: services.durationMinutes, priceCents: services.priceCents, onlineBooking: services.onlineBooking,
    }).from(services).innerJoin(locations, eq(locations.id, services.locationId)).leftJoin(serviceGroups, and(eq(serviceGroups.id, services.categoryId), eq(serviceGroups.organizationId, locations.organizationId))).where(and(eq(services.locationId, business.id), eq(services.published, true), eq(services.archived, false))).orderBy(asc(services.priceCents)),
    db.select({ weekday: openingHours.weekday, opens: openingHours.opens, closes: openingHours.closes })
      .from(openingHours).where(eq(openingHours.locationId, business.id)).orderBy(asc(openingHours.weekday)),
    db.select({
      serviceId: serviceVariants.serviceId, id: serviceVariants.id, name: serviceVariants.name,
      priceCents: serviceVariants.priceCents, durationMinutes: serviceVariants.durationMinutes,
    }).from(serviceVariants).innerJoin(services, eq(serviceVariants.serviceId, services.id))
      .where(and(eq(services.locationId, business.id), eq(services.published, true),
        eq(services.archived, false), eq(serviceVariants.archived, false)))
      .orderBy(asc(serviceVariants.priceCents), asc(serviceVariants.name)),
    db.select({ id: employees.id, name: employees.publicName, title: employees.professionalTitle, photoUrl: employees.professionalPhotoUrl }).from(employees)
      .innerJoin(locations, and(eq(locations.id, employees.locationId), eq(locations.organizationId, employees.organizationId)))
      .where(and(eq(locations.id, business.id), publicLocation, eq(employees.active, true), ne(employees.publicName, "")))
      .orderBy(asc(employees.publicName), asc(employees.id)),
  ]);
  const variantsByService = new Map<string, Omit<(typeof variants)[number], "serviceId">[]>();
  for (const { serviceId, ...variant } of variants) {
    const group = variantsByService.get(serviceId) ?? [];
    group.push(variant);
    variantsByService.set(serviceId, group);
  }
  const weekdays = ["", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
  return { ...business, staff: staff.map(({ id, name, title, photoUrl }) => ({ id, name, title: title || undefined, photoUrl: photoUrl || undefined })), services: catalog.map((service) => ({
    ...service,
    variants: variantsByService.get(service.id) ?? [],
  })), openingHours: hours.map((hour) => ({
    day: weekdays[hour.weekday]!, opens: hour.opens, closes: hour.closes,
  })) };
}

export async function findCategories() {
  return db.select({
    id: categories.id, slug: categories.slug, name: categories.name,
    businessCount: sql<number>`count(${locations.id})::int`,
  }).from(categories)
    .leftJoin(locations, and(publicLocation, or(eq(locations.categoryId, categories.id), exists(
      db.select({ id: organizationCategories.categoryId }).from(organizationCategories)
        .where(and(eq(organizationCategories.organizationId, locations.organizationId), eq(organizationCategories.categoryId, categories.id))),
    ))))
    .groupBy(categories.id).orderBy(asc(categories.sortOrder));
}

export async function catalogSummary() {
  const [counts] = await db.select({
    businessCount: sql<number>`count(*)::int`,
  }).from(locations).where(publicLocation);
  const [serviceCounts] = await db.select({ count: sql<number>`count(*)::int` })
    .from(services).innerJoin(locations, eq(services.locationId, locations.id))
    .where(and(publicLocation, eq(services.published, true), eq(services.archived, false)));
  const [categoryCounts] = await db.select({ count: sql<number>`count(*)::int` }).from(categories);
  const cities = await db.selectDistinct({ city: locations.city }).from(locations)
    .where(publicLocation).orderBy(asc(locations.city));
  const [demo] = await db.select({
    isDemo: sql<boolean>`coalesce(bool_and(${organizations.isDemo}), false)`,
  }).from(locations).innerJoin(organizations, eq(locations.organizationId, organizations.id))
    .where(publicLocation);
  return {
    businessCount: counts?.businessCount ?? 0,
    serviceCount: serviceCounts?.count ?? 0,
    categoryCount: categoryCounts?.count ?? 0,
    cities: cities.map((item) => item.city),
    isDemo: demo?.isDemo ?? false,
  };
}

export async function findPublicReviews(slug: string, sort: "newest" | "highest" | "lowest", offset: number) {
  return db.transaction(async (tx) => {
    const [location] = await tx.select({ id: locations.id }).from(locations)
      .where(and(eq(locations.slug, slug), publicLocation));
    if (!location) return null;
    const visible = and(eq(reservations.locationId, location.id), eq(reservations.status, "completed"),
      eq(bookingReviews.hiddenByModerator, false), isNotNull(bookingReviews.published), sql`${bookingReviews.published} <= now()`);
    const [stats] = await tx.select({
      count: sql<number>`count(*)::int`, average: sql<number | null>`avg(${bookingReviews.rating})::float8`,
    }).from(bookingReviews).innerJoin(reservations, eq(reservations.id, bookingReviews.bookingId)).where(visible);
    const order = sort === "highest" ? [desc(bookingReviews.rating)] : sort === "lowest" ? [asc(bookingReviews.rating)] : [];
    const reviews = await tx.select({
      id: bookingReviews.id, rating: bookingReviews.rating, comment: bookingReviews.comment,
      reply: bookingReviews.reply, date: bookingReviews.createdAt,
    }).from(bookingReviews).innerJoin(reservations, eq(reservations.id, bookingReviews.bookingId)).where(visible)
      .orderBy(...order, desc(bookingReviews.createdAt), asc(bookingReviews.id)).limit(10).offset(offset);
    return { count: stats!.count, average: stats!.average, reviews };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
