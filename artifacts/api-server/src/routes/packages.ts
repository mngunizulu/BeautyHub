import { publicLocation } from "../services/marketplace-visibility";
import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { customerPackages, db, locations, organizations, servicePackages, services, users } from "@workspace/db";
import { HttpError } from "../lib/http-error";
import { input, tenantId, uuid } from "../lib/input";
import { allowRoles, requireAuthentication, requireOrganization } from "../middlewares/authentication";

export const packagesRouter: IRouter = Router();
const business = "/organizations/:organizationId/service-packages";
const account = "/me/service-packages";
const catalogScope = and(eq(servicePackages.active, true), eq(services.published, true),
  eq(services.onlineBooking, true), eq(services.archived, false), publicLocation);

packagesRouter.use(business, requireAuthentication, requireOrganization, allowRoles("owner", "manager"));
packagesRouter.get(business, async (req, res) => {
  res.json(await db.select().from(servicePackages).where(eq(servicePackages.organizationId, tenantId(req)))
    .orderBy(asc(servicePackages.name), asc(servicePackages.id)));
});

packagesRouter.post(business, async (req, res) => {
  const data = input(z.strictObject({
    kind: z.enum(["package", "membership"]).default("package"),
    name: z.string().trim().min(1).max(120), serviceId: z.uuid(), visits: z.number().int().min(2).max(50),
    priceCents: z.number().int().min(1).max(10000000), validDays: z.number().int().min(1).max(730),
  }), req.body);
  const organizationId = tenantId(req);
  const [service] = await db.select({ id: services.id }).from(services)
    .innerJoin(locations, eq(locations.id, services.locationId))
    .where(and(eq(services.id, data.serviceId), eq(locations.organizationId, organizationId), eq(services.archived, false)));
  if (!service) throw new HttpError(404, "Leistung nicht gefunden.");
  const [offer] = await db.insert(servicePackages).values({ ...data, organizationId }).returning();
  res.status(201).json(offer);
});

packagesRouter.put(business + "/:id", async (req, res) => {
  const { active } = input(z.strictObject({ active: z.boolean() }), req.body);
  const [offer] = await db.update(servicePackages).set({ active })
    .where(and(eq(servicePackages.organizationId, tenantId(req)), eq(servicePackages.id, uuid(req.params.id)))).returning();
  if (!offer) throw new HttpError(404, "Paket nicht gefunden.");
  res.json(offer);
});

packagesRouter.use(account, requireAuthentication);
packagesRouter.get(account, async (req, res) => {
  res.json(await db.select({ id: customerPackages.id, remaining: customerPackages.remaining, expiresAt: customerPackages.expiresAt,
    kind: servicePackages.kind, name: servicePackages.name, service: services.name, business: organizations.name, priceCents: servicePackages.priceCents })
    .from(customerPackages).innerJoin(servicePackages, eq(servicePackages.id, customerPackages.packageId))
    .innerJoin(services, eq(services.id, servicePackages.serviceId))
    .innerJoin(organizations, eq(organizations.id, servicePackages.organizationId))
    .where(eq(customerPackages.userId, req.identity!.id)).orderBy(desc(customerPackages.purchasedAt)));
});

packagesRouter.get(account + "/offers", async (_req, res) => {
  res.json(await db.select({ id: servicePackages.id, kind: servicePackages.kind, name: servicePackages.name, service: services.name, business: organizations.name,
    visits: servicePackages.visits, priceCents: servicePackages.priceCents, validDays: servicePackages.validDays })
    .from(servicePackages).innerJoin(services, eq(services.id, servicePackages.serviceId))
    .innerJoin(locations, eq(locations.id, services.locationId))
    .innerJoin(organizations, eq(organizations.id, servicePackages.organizationId))
    .where(catalogScope).orderBy(asc(organizations.name), asc(servicePackages.name), asc(servicePackages.id)));
});

packagesRouter.post(account + "/offers/:id", async (req, res) => {
  const packageId = uuid(req.params.id);
  const userId = req.identity!.id;
  const { requestId, expectedPriceCents } = input(z.strictObject({
    requestId: z.uuid(), expectedPriceCents: z.number().int().positive(),
  }), req.body);
  const purchase = await db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [prior] = await tx.select({ id: customerPackages.id, packageId: customerPackages.packageId,
      priceCents: servicePackages.priceCents }).from(customerPackages)
      .innerJoin(servicePackages, eq(servicePackages.id, customerPackages.packageId))
      .where(and(eq(customerPackages.userId, userId), eq(customerPackages.requestId, requestId)));
    if (prior) {
      if (prior.packageId !== packageId || prior.priceCents !== expectedPriceCents) throw new HttpError(409, "Kaufschlüssel bereits verwendet.");
      return { id: prior.id };
    }
    const [offer] = await tx.select({ organizationId: servicePackages.organizationId, kind: servicePackages.kind, priceCents: servicePackages.priceCents, visits: servicePackages.visits,
      validDays: servicePackages.validDays }).from(servicePackages)
      .innerJoin(services, eq(services.id, servicePackages.serviceId))
      .innerJoin(locations, eq(locations.id, services.locationId))
      .where(and(eq(servicePackages.id, packageId), catalogScope)).for("share", { of: servicePackages });
    if (!offer) throw new HttpError(404, "Paket nicht verfügbar.");
    const [business] = await tx.select({ suspendedAt: organizations.suspendedAt }).from(organizations)
      .where(eq(organizations.id, offer.organizationId)).for("share");
    if (!business || business.suspendedAt) throw new HttpError(404, "Paket nicht verfügbar.");
    if (offer.priceCents !== expectedPriceCents) throw new HttpError(409, "Der Paketpreis hat sich geändert.");
    if (offer.kind === "membership") {
      const [current] = await tx.select({ id: customerPackages.id }).from(customerPackages)
        .where(and(eq(customerPackages.userId, userId), eq(customerPackages.packageId, packageId),
          gt(customerPackages.expiresAt, sql`clock_timestamp()`))).limit(1);
      if (current) throw new HttpError(409, "Diese Mitgliedschaft läuft noch.");
    }
    const [created] = await tx.insert(customerPackages).values({ packageId, userId, requestId,
      remaining: offer.visits, expiresAt: new Date(Date.now() + offer.validDays * 86400000) }).returning({ id: customerPackages.id });
    return created;
  });
  res.json(purchase);
});
