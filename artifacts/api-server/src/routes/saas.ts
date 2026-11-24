import { Router, type IRouter } from "express";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, locations, saasChanges, saasPlans, saasSubscriptions } from "@workspace/db";
import { HttpError } from "../lib/http-error";
import { input, tenantId } from "../lib/input";
import { allowRoles, requireAuthentication, requireOrganization } from "../middlewares/authentication";
import { effectiveSaasState, lockSaasOrganization, saasDay } from "../services/saas-subscriptions";

export const saasRouter: IRouter = Router();
const business = "/organizations/:organizationId/saas";
const admin = "/admin/saas-plans";
const code = z.enum(["starter", "professional", "enterprise"]);
const listPlans = () => db.select().from(saasPlans).orderBy(asc(saasPlans.monthlyCents), asc(saasPlans.code));

saasRouter.use(business, requireAuthentication, requireOrganization, allowRoles("owner"));
saasRouter.get(business, async (req, res) => {
  const organizationId = tenantId(req);
  const view = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(saasSubscriptions).where(eq(saasSubscriptions.organizationId, organizationId));
    const [usage] = await tx.select({ total: count() }).from(locations).where(eq(locations.organizationId, organizationId));
    const history = await tx.select().from(saasChanges).where(eq(saasChanges.organizationId, organizationId))
      .orderBy(desc(saasChanges.createdAt), desc(saasChanges.requestId)).limit(50);
    return { current: current ? { ...current, state: effectiveSaasState(current) } : null, locationCount: usage?.total ?? 0, history };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  res.json({ ...view, plans: await listPlans(), currency: "EUR" });
});

saasRouter.post(business + "/changes", async (req, res) => {
  const organizationId = tenantId(req);
  const change = input(z.discriminatedUnion("action", [
    z.strictObject({ action: z.literal("activate"), planCode: code, expectedCents: z.number().int().min(0), requestId: z.uuid() }),
    z.strictObject({ action: z.literal("cancel"), requestId: z.uuid() }),
  ]), req.body);
  await db.transaction(async (tx) => {
    await lockSaasOrganization(tx, organizationId);
    const [prior] = await tx.select().from(saasChanges).where(and(eq(saasChanges.organizationId, organizationId),
      eq(saasChanges.requestId, change.requestId)));
    if (prior) {
      if (prior.action === change.action && (change.action === "cancel" ||
          (prior.planCode === change.planCode && prior.amountCents === change.expectedCents))) return;
      throw new HttpError(409, "Dieser Schlüssel wurde bereits für eine andere Tarifänderung verwendet.");
    }
    const [current] = await tx.select().from(saasSubscriptions).where(eq(saasSubscriptions.organizationId, organizationId));
    const now = new Date();
    const next = change.action === "cancel" ? await cancel() : await activate();
    await tx.insert(saasSubscriptions).values({ organizationId, planCode: next.planCode, state: next.state, periodEndsAt: next.periodEndsAt })
      .onConflictDoUpdate({ target: saasSubscriptions.organizationId,
        set: { planCode: next.planCode, state: next.state, periodEndsAt: next.periodEndsAt } });
    await tx.insert(saasChanges).values({ organizationId, planCode: next.planCode, amountCents: next.amountCents,
      periodEndsAt: next.periodEndsAt, requestId: change.requestId, action: change.action });

    async function cancel() {
      if (!current || current.state === "cancelled") throw new HttpError(409, "Kein kündbarer Tarif vorhanden.");
      return { planCode: current.planCode, state: "cancelled" as const, amountCents: 0, periodEndsAt: now };
    }

    async function activate() {
      if (change.action !== "activate") throw new Error("Invalid activation");
      const [plan] = await tx.select().from(saasPlans).where(eq(saasPlans.code, change.planCode)).for("share");
      if (!plan || plan.monthlyCents !== change.expectedCents) throw new HttpError(409, "Der Tarifpreis wurde geändert.");
      if (current && current.planCode === plan.code && effectiveSaasState(current, now) === "active") {
        throw new HttpError(409, "Dieser Tarif ist bereits aktiv.");
      }
      return { planCode: plan.code, state: "active" as const, amountCents: plan.monthlyCents,
        periodEndsAt: new Date(+now + 30 * saasDay) };
    }
  });
  res.status(204).end();
});

// The foundation router protects /admin before dispatching here.
saasRouter.get(admin, async (_req, res) => { res.json(await listPlans()); });
saasRouter.put(admin + "/:code", async (req, res) => {
  const planCode = input(code, req.params.code);
  const data = input(z.strictObject({
    name: z.string().trim().min(1).max(80), monthlyCents: z.number().int().min(0).max(10000000),
    locationLimit: z.number().int().min(1).max(1000), trialDays: z.number().int().min(0).max(90),
  }), req.body);
  if (planCode !== "professional" && data.trialDays) throw new HttpError(400, "Die Testphase gilt für Professional.");
  const [plan] = await db.update(saasPlans).set(data).where(eq(saasPlans.code, planCode)).returning();
  if (!plan) throw new HttpError(404, "Tarif nicht gefunden.");
  res.json(plan);
});
