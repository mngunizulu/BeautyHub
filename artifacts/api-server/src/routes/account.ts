import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db, users, paymentReferences, staffInvitations, memberships, employees, auditEvents } from "@workspace/db";
import { createHash, randomUUID } from "node:crypto";
import { simulatedPaymentProvider } from "../lib/payments";
import { UpdateMyProfileBody, AcceptStaffInvitationBody, GetMyProfileResponse, ExportMyDataResponse } from "@workspace/api-zod";
import { clerkClient } from "@clerk/express";
import { requireAuthentication } from "../middlewares/authentication";
import { accountExportRecords } from "../services/account-export";
import { publicProfile } from "../services/identity";
import { myOrganizations } from "../services/workspace";
import { input } from "../lib/input";
import { HttpError } from "../lib/http-error";

const router: IRouter = Router();
router.use("/me", requireAuthentication);
router.get("/me", (req, res) => { res.json(GetMyProfileResponse.parse(publicProfile(req.identity!))); });
router.patch("/me", async (req, res): Promise<void> => {
  const data = input(UpdateMyProfileBody.strict(), req.body);
  if (!data.displayName.trim() || (data.phone && !/^[+()\d\s./-]{3,30}$/.test(data.phone))) throw new HttpError(400, "Name oder Telefonnummer ist ungültig.");
  const [user] = await db.update(users).set({ ...data, displayName: data.displayName.trim() }).where(eq(users.id, req.identity!.id)).returning();
  res.json(GetMyProfileResponse.parse(publicProfile(user!)));
});
router.get("/me/export", async (req, res): Promise<void> => {
  res.setHeader("Content-Disposition", 'attachment; filename="beautyhub-personendaten.json"');
  const user = req.identity!;
  const [organizations, records] = await Promise.all([myOrganizations(user.id), accountExportRecords(user.id)]);
  res.json(ExportMyDataResponse.parse({ profile: publicProfile(user), organizations, records, exportedAt: new Date().toISOString() }));
});
router.post("/me/deletion-requests", async (req, res): Promise<void> => {
  await db.update(users).set({ deletionRequestedAt: sql`coalesce(${users.deletionRequestedAt}, clock_timestamp())` }).where(eq(users.id, req.identity!.id));
  res.json({ message: "Löschanfrage gespeichert. Vor der Löschung werden Unternehmensverantwortung und Aufbewahrungspflichten geprüft. Das Konto wurde noch nicht gelöscht." });
});
router.post("/me/deletion-requests/withdraw", async (req, res) => {
  const { requestedAt } = input(z.strictObject({ requestedAt: z.iso.datetime() }), req.body);
  await db.transaction(async (tx) => {
    const [current] = await tx.select({ requestedAt: users.deletionRequestedAt }).from(users)
      .where(eq(users.id, req.identity!.id)).for("update");
    if (!current?.requestedAt) return;
    if (+current.requestedAt !== Date.parse(requestedAt)) {
      throw new HttpError(409, "Die Löschanfrage hat sich geändert.");
    }
    await tx.update(users).set({ deletionRequestedAt: null }).where(eq(users.id, req.identity!.id));
  });
  res.status(204).end();
});
router.get("/me/payment-methods", async (req, res): Promise<void> => {
  res.json(await db.select({ id: paymentReferences.id, provider: paymentReferences.provider, status: paymentReferences.status })
    .from(paymentReferences).where(eq(paymentReferences.userId, req.identity!.id)));
});
router.post("/me/payment-methods/simulated", async (req, res) => {
  if (req.body !== undefined) throw new HttpError(400, "Für die Simulation werden keine Kartendaten benötigt.");
  const [method] = await db.insert(paymentReferences).values({
    userId: req.identity!.id, provider: simulatedPaymentProvider, providerCustomerId: randomUUID(), status: "active",
  }).onConflictDoUpdate({
    target: [paymentReferences.userId, paymentReferences.provider], set: { status: "active" },
  }).returning({ id: paymentReferences.id, provider: paymentReferences.provider, status: paymentReferences.status });
  res.json(method);
});
router.post("/invitations/accept", requireAuthentication, async (req, res): Promise<void> => {
  const data = input(AcceptStaffInvitationBody.strict(), req.body);
  // Fresh managed-provider verification prevents accepting with stale email data.
  const provider = await clerkClient.users.getUser(req.identity!.externalIdentityId);
  const verifiedEmails = provider.emailAddresses.filter((email) => email.verification?.status === "verified")
    .map((email) => email.emailAddress.trim().toLowerCase());
  const hash = createHash("sha256").update(data.token).digest("hex");
  const organizationId = await db.transaction(async (tx) => {
    const [invite] = await tx.select().from(staffInvitations).where(eq(staffInvitations.tokenHash, hash)).for("update");
    if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) throw new HttpError(400, "Einladung ist ungültig, abgelaufen oder bereits verwendet.");
    if (!verifiedEmails.includes(invite.email)) throw new HttpError(403, "Diese Einladung gehört zu einer anderen verifizierten E-Mail-Adresse.", "FORBIDDEN");
    const [issuer] = await tx.select().from(memberships).where(and(
      eq(memberships.userId, invite.createdBy), eq(memberships.organizationId, invite.organizationId), eq(memberships.status, "active"),
    ));
    if (!issuer || (issuer.role !== "owner" && (issuer.role !== "manager" || invite.role !== "employee"))) {
      throw new HttpError(403, "Die einladende Person ist nicht mehr berechtigt.");
    }
    const [member] = await tx.select().from(memberships).where(and(eq(memberships.userId, req.identity!.id), eq(memberships.organizationId, invite.organizationId)));
    if (member?.role === "owner") throw new HttpError(409, "Du bist bereits Inhaber dieses Unternehmens.");
    await tx.insert(memberships).values({ organizationId: invite.organizationId, userId: req.identity!.id, role: invite.role })
      .onConflictDoUpdate({ target: [memberships.userId, memberships.organizationId], set: { status: "active", role: invite.role } });
    const [existing] = await tx.select().from(employees).where(and(eq(employees.organizationId, invite.organizationId), eq(employees.email, invite.email)));
    if (existing && existing.userId && existing.userId !== req.identity!.id) throw new HttpError(409, "Mitarbeiterprofil ist bereits verknüpft.");
    if (existing && existing.locationId !== invite.locationId) throw new HttpError(409, "Das Mitarbeiterprofil ist einem anderen Standort zugeordnet. Bitte die Standortzuordnung zuerst prüfen lassen.");
    if (existing) await tx.update(employees).set({ userId: req.identity!.id, active: true }).where(eq(employees.id, existing.id));
    else await tx.insert(employees).values({
      organizationId: invite.organizationId, locationId: invite.locationId, userId: req.identity!.id,
      displayName: req.identity!.displayName, email: invite.email,
    });
    await tx.update(staffInvitations).set({ acceptedAt: new Date() }).where(eq(staffInvitations.id, invite.id));
    await tx.insert(auditEvents).values({ organizationId: invite.organizationId, actorId: req.identity!.id, action: "invitation.accepted", targetId: invite.id });
    return invite.organizationId;
  });
  res.json((await myOrganizations(req.identity!.id)).find((org) => org.id === organizationId));
});
export default router;
