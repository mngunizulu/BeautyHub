import { publicLocation } from "./marketplace-visibility";
import { and, eq, inArray } from "drizzle-orm";
import { db, locations, services, serviceVariants } from "@workspace/db";
import { HttpError } from "../lib/http-error";
import { summarizeQuote } from "./professional-pricing";

export type BookingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type BookingSelection = { serviceId: string; variantId?: string }[];

export async function quoteSelection(tx: BookingTransaction, slug: string, items: BookingSelection, internal = false) {
  const unavailable = () => new HttpError(404, "Ein Angebot ist an diesem Standort nicht buchbar.");
  const serviceIds = [...new Set(items.map((item) => item.serviceId))];
  const variantIds = [...new Set(items.flatMap((item) => item.variantId ? [item.variantId] : []))];

  const offerings = await tx.select({
    id: services.id, name: services.name, priceCents: services.priceCents, durationMinutes: services.durationMinutes,
    preparationMinutes: services.preparationMinutes, cleanupMinutes: services.cleanupMinutes,
  }).from(services).innerJoin(locations, eq(locations.id, services.locationId)).where(and(
    eq(locations.slug, slug), internal ? undefined : publicLocation,
    internal ? undefined : eq(services.published, true), internal ? undefined : eq(services.onlineBooking, true), eq(services.archived, false), inArray(services.id, serviceIds),
  ));
  if (offerings.length !== serviceIds.length) throw unavailable();
  const variants = variantIds.length ? await tx.select().from(serviceVariants).where(and(
    inArray(serviceVariants.id, variantIds), inArray(serviceVariants.serviceId, serviceIds),
    eq(serviceVariants.archived, false),
  )) : [];
  const byService = new Map(offerings.map((entry) => [entry.id, entry]));
  const byVariant = new Map(variants.map((variant) => [variant.id, variant]));
  const lines = items.map(({ serviceId, variantId }) => {
    const service = byService.get(serviceId);
    const variant = variantId ? byVariant.get(variantId) : undefined;
    if (!service || (variantId && variant?.serviceId !== serviceId)) throw unavailable();
    return {
      serviceId, variantId: variant?.id ?? null, name: service.name, variantName: variant?.name ?? null,
      priceCents: variant?.priceCents ?? service.priceCents,
      durationMinutes: variant?.durationMinutes ?? service.durationMinutes,
      preparationMinutes: service.preparationMinutes, cleanupMinutes: service.cleanupMinutes,
    };
  });
  return summarizeQuote(lines);
}
