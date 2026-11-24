import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { HttpError } from "../lib/http-error";
import { locations, organizations, saasChanges, saasPlans, saasSubscriptions } from "@workspace/db";
import type { BookingTransaction } from "./booking-quote";

export const saasDay = 86400000;

export function effectiveSaasState(subscription: typeof saasSubscriptions.$inferSelect, now = new Date()) {
  if (subscription.state === "cancelled") return "cancelled";
  return subscription.periodEndsAt <= now ? "expired" : subscription.state;
}

export async function startSaasTrial(tx: BookingTransaction, organizationId: string) {
  const [plan] = await tx.select().from(saasPlans).where(eq(saasPlans.code, "professional"));
  if (!plan) throw new Error("Missing Professional SaaS plan");
  if (!plan.trialDays) {
    await tx.insert(saasSubscriptions).values({ organizationId, planCode: "starter", state: "active", periodEndsAt: new Date() });
    return;
  }
  const periodEndsAt = new Date(Date.now() + plan.trialDays * saasDay);
  const planCode = plan.code;
  await tx.insert(saasSubscriptions).values({ organizationId, planCode, state: "trial", periodEndsAt });
  await tx.insert(saasChanges).values({ organizationId, planCode, requestId: randomUUID(), action: "trial", amountCents: 0, periodEndsAt });
}

export async function lockSaasOrganization(tx: BookingTransaction, organizationId: string) {
  await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).for("update");
}

export async function requireLocationCapacity(tx: BookingTransaction, organizationId: string) {
  await lockSaasOrganization(tx, organizationId);
  const [entry] = await tx.select({ subscription: saasSubscriptions, limit: saasPlans.locationLimit })
    .from(saasSubscriptions).innerJoin(saasPlans, eq(saasPlans.code, saasSubscriptions.planCode))
    .where(eq(saasSubscriptions.organizationId, organizationId));
  if (!entry) return;
  const state = effectiveSaasState(entry.subscription);
  const [usage] = await tx.select({ total: count() }).from(locations).where(eq(locations.organizationId, organizationId));
  if (state === "expired" || state === "cancelled" || (usage?.total ?? 0) >= entry.limit) {
    throw new HttpError(409, "Der aktuelle Tarif erlaubt keinen zusätzlichen Standort.", "SAAS_LOCATION_LIMIT");
  }
}
