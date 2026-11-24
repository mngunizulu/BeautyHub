import { Router, type IRouter } from "express";
import { and, asc, desc, eq, exists, gte, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { businessMarketingPreferences, db, locations, marketingCapturedRecipients, marketingCaptures, marketingCampaigns, marketingTemplates, organizations, reservations, users } from "@workspace/db";
import { HttpError } from "../lib/http-error";
import { input, tenantId, uuid } from "../lib/input";
import type { BookingTransaction } from "../services/booking-quote";
import { allowRoles, requireAuthentication, requireOrganization } from "../middlewares/authentication";

export const marketingRouter: IRouter = Router();
const settings = "/me/business-marketing";
const campaigns = "/organizations/:organizationId/marketing-campaigns";
const templates = "/organizations/:organizationId/marketing-templates";
const segmentInput = z.enum(["completed", "repeat"]);
const campaignInput = z.strictObject({
  title: z.string().trim().min(1).max(120), subject: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(4000), segment: segmentInput,
});

const booked = (userId: string) => db.select({ id: reservations.id }).from(reservations)
  .innerJoin(locations, eq(locations.id, reservations.locationId))
  .where(and(eq(reservations.userId, userId), eq(reservations.status, "completed"),
    eq(locations.organizationId, organizations.id)));

marketingRouter.use(settings, requireAuthentication);
marketingRouter.get(settings, async (req, res) => {
  const userId = req.identity!.id;
  const preferences = await db.select({
    organizationId: organizations.id, name: organizations.name,
    consent: sql<boolean>`coalesce(${businessMarketingPreferences.consent}, false)`,
  }).from(organizations).leftJoin(businessMarketingPreferences, and(
    eq(businessMarketingPreferences.organizationId, organizations.id), eq(businessMarketingPreferences.userId, userId),
  )).where(or(exists(booked(userId)), eq(businessMarketingPreferences.userId, userId)))
    .orderBy(asc(organizations.name), asc(organizations.id));
  res.json(preferences);
});

marketingRouter.put(settings + "/:id", async (req, res) => {
  const userId = req.identity!.id;
  const organizationId = uuid(req.params.id);
  const { consent } = input(z.strictObject({ consent: z.boolean() }), req.body);
  const [allowed] = await db.select({ id: organizations.id }).from(organizations)
    .where(and(eq(organizations.id, organizationId), exists(booked(userId))));
  if (!allowed && consent) throw new HttpError(404, "Kein abgeschlossener Termin bei diesem Betrieb.");
  if (!allowed) {
    await db.update(businessMarketingPreferences).set({ consent: false, updatedAt: new Date() })
      .where(and(eq(businessMarketingPreferences.userId, userId), eq(businessMarketingPreferences.organizationId, organizationId)));
    res.status(204).end();
    return;
  }
  await db.insert(businessMarketingPreferences).values({ userId, organizationId, consent }).onConflictDoUpdate({
    target: [businessMarketingPreferences.organizationId, businessMarketingPreferences.userId],
    set: { consent, updatedAt: new Date() },
  });
  res.status(204).end();
});

marketingRouter.use(campaigns, requireAuthentication, requireOrganization, allowRoles("owner", "manager"));
marketingRouter.get(campaigns, async (req, res) => {
  res.json(await db.select().from(marketingCampaigns).where(eq(marketingCampaigns.organizationId, tenantId(req)))
    .orderBy(desc(marketingCampaigns.updatedAt), asc(marketingCampaigns.id)));
});

marketingRouter.post(campaigns, async (req, res) => {
  const data = input(campaignInput, req.body);
  const [draft] = await db.insert(marketingCampaigns).values({ ...data, organizationId: tenantId(req) }).returning();
  res.status(201).json(draft);
});

marketingRouter.put(campaigns + "/:id", async (req, res) => {
  const data = input(campaignInput, req.body);
  const [draft] = await db.update(marketingCampaigns).set({ ...data, updatedAt: new Date() })
    .where(and(eq(marketingCampaigns.id, uuid(req.params.id)), eq(marketingCampaigns.organizationId, tenantId(req))))
    .returning();
  if (!draft) throw new HttpError(404, "Kampagne nicht gefunden.");
  res.json(draft);
});

marketingRouter.use(templates, requireAuthentication, requireOrganization, allowRoles("owner", "manager"));
marketingRouter.get(templates, async (req, res) => {
  res.json(await db.select().from(marketingTemplates).where(eq(marketingTemplates.organizationId, tenantId(req)))
    .orderBy(asc(marketingTemplates.title), asc(marketingTemplates.id)));
});

marketingRouter.post(templates, async (req, res) => {
  const data = input(campaignInput, req.body);
  const [template] = await db.insert(marketingTemplates).values({ ...data, organizationId: tenantId(req) }).returning();
  res.status(201).json(template);
});

marketingRouter.put(templates + "/:id", async (req, res) => {
  const data = input(campaignInput, req.body);
  const [template] = await db.update(marketingTemplates).set({ ...data, updatedAt: new Date() })
    .where(and(eq(marketingTemplates.id, uuid(req.params.id)), eq(marketingTemplates.organizationId, tenantId(req))))
    .returning();
  if (!template) throw new HttpError(404, "Vorlage nicht gefunden.");
  res.json(template);
});

function eligibleAudience(connection: typeof db | BookingTransaction, organizationId: string, segment: "completed" | "repeat") {
  return connection.select({ id: users.id, email: users.email }).from(users)
    .innerJoin(businessMarketingPreferences, and(eq(businessMarketingPreferences.userId, users.id),
      eq(businessMarketingPreferences.organizationId, organizationId), eq(businessMarketingPreferences.consent, true)))
    .innerJoin(reservations, and(eq(reservations.userId, users.id), eq(reservations.status, "completed")))
    .innerJoin(locations, and(eq(locations.id, reservations.locationId), eq(locations.organizationId, organizationId)))
    .where(and(eq(users.emailVerified, true), ne(users.email, ""), isNull(users.deletionRequestedAt)))
    .groupBy(users.id, users.email).having(gte(sql`count(*)`, segment === "repeat" ? 2 : 1));
}

marketingRouter.get(campaigns + "/audience", async (req, res) => {
  const { segment } = input(z.strictObject({ segment: segmentInput }), req.query);
  const audience = eligibleAudience(db, tenantId(req), segment).as("audience");
  const [result] = await db.select({ count: sql<number>`count(*)::int` }).from(audience);
  res.json(result);
});

const metadata = {
  id: marketingCaptures.id, count: marketingCaptures.count, createdAt: marketingCaptures.createdAt,
};
const capturePath = campaigns + "/:id/captures";
const scopedCampaign = (id: string, organizationId: string) =>
  and(eq(marketingCampaigns.id, id), eq(marketingCampaigns.organizationId, organizationId));

marketingRouter.get(capturePath, async (req, res) => {
  const id = uuid(req.params.id);
  const rows = await db.select(metadata).from(marketingCaptures)
    .innerJoin(marketingCampaigns, eq(marketingCampaigns.id, marketingCaptures.campaignId))
    .where(scopedCampaign(id, tenantId(req)))
    .orderBy(desc(marketingCaptures.createdAt), desc(marketingCaptures.id)).limit(20);
  res.json(rows);
});

marketingRouter.post(capturePath, async (req, res) => {
  const origin = process.env.BEAUTYHUB_MARKETING_CAPTURE_APP_URL;
  if (!origin) throw new HttpError(409, "Testaufzeichnung ist nicht aktiviert.");
  const campaignId = uuid(req.params.id);
  const organizationId = tenantId(req);
  const { idempotencyKey } = input(z.strictObject({ idempotencyKey: z.uuid() }), req.body);
  const result = await db.transaction(async (tx) => {
    const [draft] = await tx.select().from(marketingCampaigns).where(scopedCampaign(campaignId, organizationId)).for("update");
    if (!draft) throw new HttpError(404, "Kampagne nicht gefunden.");
    const [prior] = await tx.select(metadata).from(marketingCaptures)
      .where(and(eq(marketingCaptures.campaignId, campaignId), eq(marketingCaptures.idempotencyKey, idempotencyKey)));
    if (prior) return { row: prior, created: false };
    const [business] = await tx.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId));
    const link = new URL("konto", origin.endsWith("/") ? origin : origin + "/");
    link.searchParams.set("business-marketing", organizationId);
    if (!["http:", "https:"].includes(link.protocol)) throw new HttpError(409, "Ungueltige URL fuer die Testaufzeichnung.");
    const audience = await eligibleAudience(tx, organizationId, draft.segment).orderBy(asc(users.id)).limit(1001);
    if (audience.length > 1000) throw new HttpError(409, "Testaufzeichnung ist auf 1000 Kontakte begrenzt.");
    const [capture] = await tx.insert(marketingCaptures).values({
      campaignId, idempotencyKey, subject: draft.subject, count: audience.length,
      message: business!.name + "\n\n" + draft.body + "\n\nWerbe-E-Mails verwalten und abbestellen: " + link.href,
    }).returning(metadata);
    if (audience.length) await tx.insert(marketingCapturedRecipients).values(audience.map((user) => ({
      captureId: capture!.id, userId: user.id, email: user.email,
    })));
    return { row: capture, created: true };
  });
  res.status(result.created ? 201 : 200).json(result.row);
});
