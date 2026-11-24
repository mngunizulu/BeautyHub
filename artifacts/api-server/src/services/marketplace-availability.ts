import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";
import { db, serviceVariants, services } from "@workspace/db";
import { findPublicBusinesses, literalPattern } from "../repositories/catalog";
import { availability, bookingLocation } from "./booking-availability";
import { localDayMinutes } from "./booking-time";

export async function findBusinessesWithAvailability(
  filters: NonNullable<Parameters<typeof findPublicBusinesses>[0]>,
  date: string,
) {
  const businesses = await findPublicBusinesses({ ...filters, maxPriceCents: undefined });
  if (!businesses.length) return [];
  const ids = businesses.map(({ id }) => id);
  const pattern = filters.service ? literalPattern(filters.service) : undefined;
  const maxPrice = filters.maxPriceCents;
  const publicServices = and(inArray(services.locationId, ids), eq(services.published, true),
    eq(services.archived, false), eq(services.onlineBooking, true));
  const [base, variants] = await Promise.all([
    db.select({ locationId: services.locationId, serviceId: services.id }).from(services)
      .where(and(publicServices, pattern ? ilike(services.name, pattern) : undefined)).orderBy(asc(services.durationMinutes)),
    db.select({ locationId: services.locationId, serviceId: services.id, variantId: serviceVariants.id }).from(serviceVariants)
      .innerJoin(services, eq(serviceVariants.serviceId, services.id))
      .where(and(publicServices, eq(serviceVariants.archived, false),
        pattern ? or(ilike(services.name, pattern), ilike(serviceVariants.name, pattern)) : undefined)).orderBy(asc(serviceVariants.durationMinutes)),
  ]);
  const offerings = new Map<string, { serviceId: string; variantId?: string }[]>();
  for (const { locationId, ...offering } of [...base, ...variants]) {
    const group = offerings.get(locationId) ?? [];
    group.push(offering);
    offerings.set(locationId, group);
  }
  const now = new Date();
  const days = new Map<string, ReturnType<typeof localDayMinutes>>();
  const found = [];
  for (let index = 0; index < businesses.length; index += 4) {
    const batch = await Promise.all(businesses.slice(index, index + 4).map(async (business) => {
      const candidates = offerings.get(business.id);
      if (!candidates) return undefined;
      try {
        return await db.transaction(async (tx) => {
          const location = await bookingLocation(tx, business.slug);
          for (const candidate of candidates) {
            const { slots } = await availability(tx, location, [candidate], date, now, undefined, {
              firstOnly: true, maxPriceCents: maxPrice,
              dayMinutes: () => {
                let minutes = days.get(location.timezone);
                if (!minutes) { minutes = localDayMinutes(date, location.timezone); days.set(location.timezone, minutes); }
                return minutes;
              },
            });
            if (slots.length) return business;
          }
          return undefined;
        }, { isolationLevel: "repeatable read", accessMode: "read only" });
      } catch (error) {
        if (error instanceof Error && "status" in error && error.status === 404) return undefined;
        throw error;
      }
    }));
    found.push(...batch.filter((business) => business !== undefined));
  }
  return found;
}
