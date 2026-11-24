import { Router, type IRouter } from "express";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import { db, employees, employeeServices, locations, professionalPrices, services, serviceVariants } from "@workspace/db";
import { allowRoles, requireAuthentication, requireOrganization } from "../middlewares/authentication";
import { input, tenantId, uuid } from "../lib/input";
import { HttpError } from "../lib/http-error";
import type { BookingTransaction } from "../services/booking-quote";

export const professionalPricingRouter: IRouter = Router();
const route = "/organizations/:organizationId/locations/:locationId/professional-pricing" as const;
professionalPricingRouter.use(route, requireAuthentication, requireOrganization, allowRoles("owner", "manager"));

async function locationFor(tx: BookingTransaction, id: string, organizationId: string, lock = false) {
  const query = tx.select().from(locations).where(and(eq(locations.id, id), eq(locations.organizationId, organizationId)));
  const [location] = await (lock ? query.for("update") : query);
  if (!location) throw new HttpError(404, "Standort nicht gefunden.");
  return location;
}

professionalPricingRouter.get(route, async (req, res) => {
  const result = await db.transaction(async (tx) => {
    const location = await locationFor(tx, uuid(req.params.locationId), tenantId(req));
    const staff = await tx.select({ id: employees.id, professionalTitle: employees.professionalTitle, professionalPhotoUrl: employees.professionalPhotoUrl })
      .from(employees).where(and(eq(employees.locationId, location.id), eq(employees.organizationId, location.organizationId)));
    const offers = staff.length ? await tx.select({
      employeeId: professionalPrices.employeeId, serviceId: professionalPrices.serviceId, variantId: professionalPrices.variantId,
      priceCents: professionalPrices.priceCents, durationMinutes: professionalPrices.durationMinutes,
    }).from(professionalPrices).innerJoin(services, eq(services.id, professionalPrices.serviceId)).where(and(
      inArray(professionalPrices.employeeId, staff.map(({ id }) => id)), eq(services.locationId, location.id),
    )) : [];
    return { differentialPricing: location.differentialPricing, allowProfessionalChoice: location.allowProfessionalChoice,
      allowAnyProfessional: location.allowAnyProfessional, staff, offers };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  res.json(result);
});

professionalPricingRouter.put(route, async (req, res) => {
  const body = input(z.strictObject({ differentialPricing: z.boolean(), allowProfessionalChoice: z.boolean(), allowAnyProfessional: z.boolean() }), req.body);
  if (!body.allowProfessionalChoice && !body.allowAnyProfessional) throw new HttpError(400, "Aktiviere mindestens eine Auswahlmöglichkeit.");
  await db.transaction(async (tx) => {
    const location = await locationFor(tx, uuid(req.params.locationId), tenantId(req), true);
    await tx.update(locations).set(body).where(eq(locations.id, location.id));
  });
  res.status(204).end();
});

professionalPricingRouter.put(`${route}/employees/:employeeId`, async (req, res) => {
  const permittedPhoto = z.url({ protocol: /^https$/ }).refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password && value.length <= 1000;
  });
  const body = input(z.strictObject({ professionalTitle: z.string().trim().max(100), professionalPhotoUrl: z.union([z.literal(""), permittedPhoto]) }), req.body);
  const id = uuid(req.params.employeeId);
  await db.transaction(async (tx) => {
    const location = await locationFor(tx, uuid(req.params.locationId), tenantId(req), true);
    const [row] = await tx.update(employees).set(body).where(and(eq(employees.id, id),
      eq(employees.locationId, location.id), eq(employees.organizationId, location.organizationId))).returning({ id: employees.id });
    if (!row) throw new HttpError(404, "Teammitglied nicht gefunden.");
  });
  res.status(204).end();
});

professionalPricingRouter.put(`${route}/overrides`, async (req, res) => {
  const data = input(z.strictObject({
    employeeId: z.uuid(), serviceId: z.uuid(), variantId: z.uuid().nullable(),
    priceCents: z.number().int().min(0).max(10000000).nullable(),
    durationMinutes: z.number().int().min(1).max(720).nullable(),
  }), req.body);
  await db.transaction(async (tx) => {
    const location = await locationFor(tx, uuid(req.params.locationId), tenantId(req), true);
    const [eligible] = await tx.select({ id: employeeServices.employeeId }).from(employeeServices)
      .innerJoin(employees, eq(employees.id, employeeServices.employeeId)).innerJoin(services, eq(services.id, employeeServices.serviceId))
      .where(and(eq(employeeServices.employeeId, data.employeeId), eq(employeeServices.serviceId, data.serviceId),
        eq(employees.organizationId, location.organizationId), eq(employees.locationId, location.id),
        eq(services.locationId, location.id), eq(services.archived, false)));
    if (!eligible) throw new HttpError(404, "Leistungszuordnung nicht gefunden.");
    if (data.variantId) {
      const [variant] = await tx.select({ id: serviceVariants.id }).from(serviceVariants)
        .where(and(eq(serviceVariants.id, data.variantId), eq(serviceVariants.serviceId, data.serviceId), eq(serviceVariants.archived, false)));
      if (!variant) throw new HttpError(404, "Variante nicht gefunden.");
    }
    await tx.delete(professionalPrices).where(and(eq(professionalPrices.employeeId, data.employeeId),
      eq(professionalPrices.serviceId, data.serviceId), data.variantId
        ? eq(professionalPrices.variantId, data.variantId) : isNull(professionalPrices.variantId)));
    if (data.priceCents !== null || data.durationMinutes !== null) await tx.insert(professionalPrices).values(data);
  });
  res.status(204).end();
});
