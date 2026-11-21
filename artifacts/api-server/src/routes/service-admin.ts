import { Router, type IRouter, type Request } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db, locations, services, employees, employeeServices, serviceVariants, serviceGroups,
  organizations, cancellationPolicies, auditEvents,
} from "@workspace/db";
import { CreateBusinessServiceBody, CreateServiceCategoryBody, SaveCancellationPolicyBody } from "@workspace/api-zod";
import { input, uuid, tenantId } from "../lib/input";
import { HttpError } from "../lib/http-error";
import { allowRoles } from "../middlewares/authentication";
import { workspace } from "../services/workspace";

export const serviceAdminRouter: IRouter = Router({ mergeParams: true });
serviceAdminRouter.use(allowRoles("owner", "manager"));
async function writeService(req: Request, create: boolean) {
  const orgId = tenantId(req);
  const data = input(CreateBusinessServiceBody.strict(), req.body);
  if (!data.name.trim()) throw new HttpError(400, "Name der Leistung fehlt.");
  const [location] = await db.select().from(locations).where(and(eq(locations.id, data.locationId), eq(locations.organizationId, orgId)));
  if (!location) throw new HttpError(400, "Standort gehört nicht zu diesem Unternehmen.");
  if (data.categoryId) {
    const [group] = await db.select().from(serviceGroups).where(and(eq(serviceGroups.id, uuid(data.categoryId)), eq(serviceGroups.organizationId, orgId)));
    if (!group) throw new HttpError(400, "Leistungskategorie gehört nicht zu diesem Unternehmen.");
  }
  if (new Set(data.employeeIds).size !== data.employeeIds.length) throw new HttpError(400, "Doppelte Mitarbeiterzuordnung.");
  if (data.employeeIds.length) {
    const staff = await db.select().from(employees).where(and(
      inArray(employees.id, data.employeeIds), eq(employees.organizationId, orgId),
      eq(employees.locationId, data.locationId), eq(employees.active, true),
    ));
    if (staff.length !== data.employeeIds.length) throw new HttpError(400, "Fachkräfte müssen aktiv sein und zum gleichen Standort gehören.");
  }
  const serviceId = create ? null : uuid(req.params.serviceId);
  const [existing] = serviceId ? await db.select({ service: services, location: locations }).from(services)
    .innerJoin(locations, eq(services.locationId, locations.id))
    .where(and(eq(services.id, serviceId), eq(locations.organizationId, orgId))) : [];
  if (!create && (!existing || existing.service.archived)) throw new HttpError(404, "Leistung nicht gefunden oder archiviert.");
  if (existing && existing.service.locationId !== data.locationId) throw new HttpError(400, "Bestehende Leistungen können nicht zwischen Standorten verschoben werden.");
  const { variants, employeeIds, ...fields } = data;
  if (variants.some((variant) => !variant.name.trim())) throw new HttpError(400, "Varianten benötigen einen Namen.");
  await db.transaction(async (tx) => {
    let savedId: string;
    if (existing) {
      await tx.update(services).set({ ...fields, categoryId: data.categoryId || null }).where(eq(services.id, existing.service.id));
      savedId = existing.service.id;
      await tx.delete(employeeServices).where(eq(employeeServices.serviceId, savedId));
    } else {
      const [created] = await tx.insert(services).values({ ...fields, categoryId: data.categoryId || null }).returning();
      savedId = created!.id;
    }
    if (employeeIds.length) await tx.insert(employeeServices).values(employeeIds.map((employeeId) => ({ employeeId, serviceId: savedId })));
    const existingVariants = await tx.select().from(serviceVariants).where(eq(serviceVariants.serviceId, savedId));
    if (new Set(variants.flatMap((v) => v.id ? [v.id] : [])).size !== variants.filter((v) => v.id).length) throw new HttpError(400, "Doppelte Varianten.");
    for (const variant of variants) {
      if (variant.id && !existingVariants.some((entry) => entry.id === variant.id)) throw new HttpError(403, "Variantenkennung gehört nicht zu dieser Leistung.");
    }
    await tx.update(serviceVariants).set({ archived: true }).where(eq(serviceVariants.serviceId, savedId));
    for (const variant of variants) {
      if (variant.id) await tx.update(serviceVariants).set({ name: variant.name, priceCents: variant.priceCents, durationMinutes: variant.durationMinutes, archived: false }).where(eq(serviceVariants.id, variant.id));
      else await tx.insert(serviceVariants).values({ ...variant, serviceId: savedId });
    }
  });
}
serviceAdminRouter.post("/services", async (req, res): Promise<void> => {
  await writeService(req, true);
  res.status(201).json(await workspace(tenantId(req), req.organizationRole!, req.identity!.id));
});
serviceAdminRouter.put("/services/:serviceId", async (req, res): Promise<void> => {
  await writeService(req, false);
  res.json(await workspace(tenantId(req), req.organizationRole!, req.identity!.id));
});
serviceAdminRouter.delete("/services/:serviceId", async (req, res): Promise<void> => {
  const orgId = tenantId(req);
  const [service] = await db.select({ id: services.id }).from(services)
    .innerJoin(locations, eq(locations.id, services.locationId))
    .where(and(eq(services.id, uuid(req.params.serviceId)), eq(locations.organizationId, orgId)));
  if (!service) throw new HttpError(404, "Leistung nicht gefunden.");
  await db.update(services).set({ archived: true, published: false, onlineBooking: false }).where(eq(services.id, service.id));
  res.json(await workspace(orgId, req.organizationRole!, req.identity!.id));
});
serviceAdminRouter.post("/service-categories", async (req, res): Promise<void> => {
  const data = input(CreateServiceCategoryBody.strict(), req.body);
  if (!data.name.trim()) throw new HttpError(400, "Kategoriename fehlt.");
  const orgId = tenantId(req);
  await db.insert(serviceGroups).values({ name: data.name.trim(), organizationId: orgId }).onConflictDoNothing();
  res.status(201).json(await workspace(orgId, req.organizationRole!, req.identity!.id));
});
serviceAdminRouter.put("/policy", async (req, res): Promise<void> => {
  const orgId = tenantId(req);
  const data = input(SaveCancellationPolicyBody.strict(), req.body);
  if ((data.lateFeeType === "percentage" && data.lateFeeValue > 100) || (data.noShowFeeType === "percentage" && data.noShowFeeValue > 100)) throw new HttpError(400, "Prozentwerte dürfen 100 nicht überschreiten.");
  await db.transaction(async (tx) => {
    await tx.select().from(organizations).where(eq(organizations.id, orgId)).for("update");
    const [latest] = await tx.select().from(cancellationPolicies).where(eq(cancellationPolicies.organizationId, orgId)).orderBy(desc(cancellationPolicies.version)).limit(1);
    const [policy] = await tx.insert(cancellationPolicies).values({ ...data, organizationId: orgId, version: (latest?.version ?? 0) + 1 }).returning();
    await tx.insert(auditEvents).values({ organizationId: orgId, actorId: req.identity!.id, action: "policy.version_created", targetId: policy!.id });
  });
  res.json(await workspace(orgId, req.organizationRole!, req.identity!.id));
});
