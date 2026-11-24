import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import {
  db, organizations, memberships, categories, locations, openingHours, employees, services, cancellationPolicies, auditEvents,
} from "@workspace/db";
import {
  CreateOrganizationBody, SaveOrganizationProfileBody, SaveBusinessLocationBody,
  SetBusinessPublicationBody,
} from "@workspace/api-zod";
import { requireAuthentication, requireOrganization, allowRoles } from "../middlewares/authentication";
import { input, uuid, emailOrEmpty, validHours } from "../lib/input";
import { HttpError } from "../lib/http-error";
import { myOrganizations, workspace, publicationIssues } from "../services/workspace";
import { requirePlatformIntake } from "../services/platform-settings";
import { requireLocationCapacity, startSaasTrial } from "../services/saas-subscriptions";
import { staffRouter } from "./staff";
import { serviceAdminRouter } from "./service-admin";

const router: IRouter = Router();
const slugify = (name: string) => name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "studio";
router.use("/organizations", requireAuthentication);
router.get("/organizations", async (req, res): Promise<void> => { res.json(await myOrganizations(req.identity!.id)); });
router.post("/organizations", async (req, res): Promise<void> => {
  const data = input(CreateOrganizationBody.strict(), req.body);
  if (data.name.trim().length < 2) throw new HttpError(400, "Unternehmensname benötigt mindestens zwei Zeichen.");
  const [category] = await db.select().from(categories).where(eq(categories.id, data.categoryId));
  if (!category) throw new HttpError(400, "Ungültige Unternehmenskategorie.");
  const orgId = await db.transaction(async (tx) => {
    await requirePlatformIntake(tx, "businessRegistrationOpen");
    const [org] = await tx.insert(organizations).values({ name: data.name.trim() }).returning();
    await startSaasTrial(tx, org!.id);
    await tx.insert(memberships).values({ userId: req.identity!.id, organizationId: org!.id, role: "owner" });
    const [location] = await tx.insert(locations).values({
      organizationId: org!.id, categoryId: category.id, name: org!.name, slug: `${slugify(org!.name)}-${randomUUID().slice(0, 8)}`,
      description: "", city: "", district: "", address: "", postalCode: "", imageKey: "illustration",
    }).returning();
    await tx.insert(employees).values({
      organizationId: org!.id, locationId: location!.id, userId: req.identity!.id,
      displayName: req.identity!.displayName, email: req.identity!.email,
    });
    await tx.insert(cancellationPolicies).values({ organizationId: org!.id });
    await tx.insert(auditEvents).values({ organizationId: org!.id, actorId: req.identity!.id, action: "organization.created", targetId: org!.id });
    return org!.id;
  });
  res.status(201).json(await workspace(orgId, "owner", req.identity!.id));
});

router.use("/organizations/:organizationId", requireOrganization);
router.get("/organizations/:organizationId/workspace", async (req, res): Promise<void> => {
  res.json(await workspace(uuid(req.params.organizationId), req.organizationRole!, req.identity!.id));
});
router.use("/organizations/:organizationId", staffRouter);
router.use("/organizations/:organizationId", serviceAdminRouter);

router.put("/organizations/:organizationId/profile", allowRoles("owner", "manager"), async (req, res): Promise<void> => {
  const orgId = uuid(req.params.organizationId);
  const data = input(SaveOrganizationProfileBody.strict(), req.body);
  if (data.name.trim().length < 2) throw new HttpError(400, "Unternehmensname benötigt mindestens zwei Zeichen.");
  emailOrEmpty(data.contactEmail);
  if (data.website && !/^https?:\/\/[^.\s]+\.[^\s]+$/.test(data.website)) throw new HttpError(400, "Website muss eine vollständige http(s)-Adresse sein.");
  for (const url of [data.socialUrl, data.logoUrl]) {
    if (url && (!URL.canParse(url) || new URL(url).protocol !== "https:")) {
      throw new HttpError(400, "Logo und Social-Media-Link benötigen eine vollständige HTTPS-Adresse.");
    }
  }
  const [category] = await db.select().from(categories).where(eq(categories.id, data.categoryId));
  if (!category) throw new HttpError(400, "Unternehmenskategorie nicht gefunden.");
  const [live] = await db.select().from(locations).where(and(eq(locations.organizationId, orgId), eq(locations.published, true)));
  if (live && (!data.description.trim() || !data.contactEmail || !data.phone)) throw new HttpError(400, "Veröffentlichte Profile benötigen Beschreibung und Kontaktdaten. Bitte zuerst unveröffentlichen.");
  const { categoryId, onboardingStep, ...profile } = data;
  await db.transaction(async (tx) => {
    await tx.update(organizations).set({ ...profile, name: data.name.trim(), onboardingStep: String(onboardingStep) }).where(eq(organizations.id, orgId));
    await tx.update(locations).set({ description: data.description, categoryId }).where(eq(locations.organizationId, orgId));
  });
  res.json(await workspace(orgId, req.organizationRole!, req.identity!.id));
});

async function saveLocation(req: Parameters<import("express").RequestHandler>[0], create: boolean): Promise<void> {
  const orgId = uuid(req.params.organizationId);
  const data = input(SaveBusinessLocationBody.strict(), req.body);
  if (data.name.trim().length < 2) throw new HttpError(400, "Standortname benötigt mindestens zwei Zeichen.");
  validHours(data.openingHours);
  try { new Intl.DateTimeFormat("de-DE", { timeZone: data.timezone }); } catch { throw new HttpError(400, "Ungültige IANA-Zeitzone."); }
  if ((data.latitude == null) !== (data.longitude == null)) throw new HttpError(400, "Koordinaten müssen als vollständiges Paar angegeben werden.");
  const [reference] = await db.select().from(locations).where(eq(locations.organizationId, orgId)).orderBy(asc(locations.createdAt), asc(locations.id));
  if (!reference) throw new HttpError(404, "Standort nicht gefunden.");
  let locationId = create ? randomUUID() : uuid(req.params.locationId);
  const [existing] = create ? [] : await db.select().from(locations).where(and(eq(locations.id, locationId), eq(locations.organizationId, orgId)));
  if (!create && !existing) throw new HttpError(404, "Standort nicht gefunden.");
  if (existing?.published && (!data.city.trim() || !data.street.trim() || !data.houseNumber.trim() || !/^\d{5}$/.test(data.postalCode) || !data.openingHours.length)) {
    throw new HttpError(400, "Veröffentlichte Standorte benötigen vollständige Adresse und Öffnungszeiten.");
  }
  const { openingHours: hours, ...fields } = data;
  await db.transaction(async (tx) => {
    if (create) {
      await requireLocationCapacity(tx, orgId);
      const [location] = await tx.insert(locations).values({
        ...fields, organizationId: orgId, categoryId: reference.categoryId,
        description: reference.description, imageKey: "illustration", address: `${data.street} ${data.houseNumber}`.trim(),
        slug: `${slugify(data.name)}-${randomUUID().slice(0, 8)}`, id: locationId,
      }).returning();
      locationId = location!.id;
    } else {
      await tx.update(locations).set({ ...fields, address: `${data.street} ${data.houseNumber}`.trim() }).where(eq(locations.id, locationId));
      await tx.delete(openingHours).where(eq(openingHours.locationId, locationId));
    }
    if (hours.length) await tx.insert(openingHours).values(hours.map((hour) => ({ ...hour, locationId })));
  });
}
router.post("/organizations/:organizationId/locations", allowRoles("owner", "manager"), async (req, res): Promise<void> => {
  await saveLocation(req, true);
  res.status(201).json(await workspace(uuid(req.params.organizationId), req.organizationRole!, req.identity!.id));
});
router.put("/organizations/:organizationId/locations/:locationId", allowRoles("owner", "manager"), async (req, res): Promise<void> => {
  await saveLocation(req, false);
  res.json(await workspace(uuid(req.params.organizationId), req.organizationRole!, req.identity!.id));
});
router.put("/organizations/:organizationId/publication", allowRoles("owner"), async (req, res): Promise<void> => {
  const orgId = uuid(req.params.organizationId);
  const data = input(SetBusinessPublicationBody.strict(), req.body);
  await db.transaction(async (tx) => {
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId)).for("update");
    const [location] = await tx.select().from(locations).where(and(eq(locations.id, data.locationId), eq(locations.organizationId, orgId)));
    if (!location) throw new HttpError(404, "Standort nicht gefunden.");
    if (data.published) {
      const catalog = await tx.select().from(services).where(eq(services.locationId, location.id));
      const staff = await tx.select().from(employees).where(eq(employees.locationId, location.id));
      const hours = await tx.select().from(openingHours).where(eq(openingHours.locationId, location.id));
      const issues = publicationIssues(org!, location, catalog, staff);
      if (!hours.length) issues.push("Öffnungszeiten fehlen.");
      if (issues.length) throw new HttpError(400, issues.join(" "), "INCOMPLETE_BUSINESS");
    }
    await tx.update(locations).set({ published: data.published }).where(eq(locations.id, location.id));
    await tx.insert(auditEvents).values({ organizationId: orgId, actorId: req.identity!.id, action: data.published ? "location.published" : "location.unpublished", targetId: location.id });
  });
  res.json(await workspace(orgId, req.organizationRole!, req.identity!.id));
});
export default router;
