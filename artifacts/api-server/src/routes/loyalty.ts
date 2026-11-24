import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db, loyaltyAwards, loyaltyPrograms, loyaltyRedemptions, organizations, posVouchers, users } from "@workspace/db";
import { HttpError } from "../lib/http-error";
import { input, tenantId, uuid } from "../lib/input";
import { allowRoles, requireAuthentication, requireOrganization } from "../middlewares/authentication";

const rewardPoints = 50;
const rewardCents = 500;
export const loyaltyRouter: IRouter = Router();
const settings = "/organizations/:organizationId/loyalty";

loyaltyRouter.use(settings, requireAuthentication, requireOrganization, allowRoles("owner", "manager"));

loyaltyRouter.get(settings, async (req, res) => {
  const [program] = await db.select({ pointsPerVisit: loyaltyPrograms.pointsPerVisit }).from(loyaltyPrograms)
    .where(eq(loyaltyPrograms.organizationId, tenantId(req)));
  res.json(program ?? { pointsPerVisit: 0 });
});

loyaltyRouter.put(settings, async (req, res) => {
  const { pointsPerVisit } = input(z.strictObject({ pointsPerVisit: z.number().int().min(0).max(1000) }), req.body);
  await db.insert(loyaltyPrograms).values({ organizationId: tenantId(req), pointsPerVisit }).onConflictDoUpdate({
    target: loyaltyPrograms.organizationId, set: { pointsPerVisit },
  });
  res.json({ pointsPerVisit });
});

loyaltyRouter.get("/me/loyalty", requireAuthentication, async (req, res) => {
  res.json(await db.select({
    organizationId: organizations.id, name: organizations.name,
    points: sql<number>`greatest(0, sum(${loyaltyAwards.points}) -
      coalesce((select sum(r.points) from loyalty_redemptions r
        where r.organization_id = ${organizations.id} and r.user_id = ${req.identity!.id}), 0))`.mapWith(Number),
  }).from(loyaltyAwards).innerJoin(organizations, eq(organizations.id, loyaltyAwards.organizationId))
    .where(eq(loyaltyAwards.userId, req.identity!.id)).groupBy(organizations.id)
    .orderBy(asc(organizations.name), asc(organizations.id)));
});

const rewards = "/me/loyalty/rewards";
const voucherFields = { code: posVouchers.code, discountCents: posVouchers.discountCents, redeemedAt: posVouchers.redeemedAt };
loyaltyRouter.get(rewards, requireAuthentication, async (req, res) => {
  res.json(await db.select({ ...voucherFields, name: organizations.name }).from(loyaltyRedemptions)
    .innerJoin(posVouchers, eq(posVouchers.id, loyaltyRedemptions.voucherId))
    .innerJoin(organizations, eq(organizations.id, loyaltyRedemptions.organizationId))
    .where(eq(loyaltyRedemptions.userId, req.identity!.id)).orderBy(asc(posVouchers.code)));
});

loyaltyRouter.post(rewards + "/:organizationId", requireAuthentication, async (req, res) => {
  const organizationId = uuid(req.params.organizationId);
  const { requestId } = input(z.strictObject({ requestId: z.uuid() }), req.body);
  const userId = req.identity!.id;
  const voucher = await db.transaction(async (tx) => {
    const [customer] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    if (!customer) throw new HttpError(404, "Konto nicht gefunden.");
    const scope = and(eq(loyaltyRedemptions.userId, userId), eq(loyaltyRedemptions.organizationId, organizationId));
    const [prior] = await tx.select(voucherFields).from(loyaltyRedemptions)
      .innerJoin(posVouchers, eq(posVouchers.id, loyaltyRedemptions.voucherId))
      .where(and(scope, eq(loyaltyRedemptions.requestId, requestId)));
    if (prior) return prior;
    const [balance] = await tx.select({
      points: sql<number>`coalesce(sum(${loyaltyAwards.points}), 0) -
        coalesce((select sum(r.points) from loyalty_redemptions r
          where r.organization_id = ${organizationId} and r.user_id = ${userId}), 0)`.mapWith(Number),
    }).from(loyaltyAwards).where(and(eq(loyaltyAwards.organizationId, organizationId), eq(loyaltyAwards.userId, userId)));
    if ((balance?.points ?? 0) < rewardPoints) throw new HttpError(409, "Nicht genügend Treuepunkte.");
    const [created] = await tx.insert(posVouchers).values({ organizationId, loyaltyOnly: true,
      code: "TREUE-" + randomBytes(12).toString("hex").toUpperCase(), discountCents: rewardCents })
      .returning({ ...voucherFields, id: posVouchers.id });
    await tx.insert(loyaltyRedemptions).values({ voucherId: created!.id, userId, organizationId, requestId, points: rewardPoints });
    const { code, discountCents, redeemedAt } = created!;
    return { code, discountCents, redeemedAt };
  });
  res.json(voucher);
});
