import { Router, type IRouter, type Request } from "express";
import { and, eq } from "drizzle-orm";
import { randomBytes, createHash } from "node:crypto";
import { db, employees, locations, memberships, staffInvitations, auditEvents, organizations, employeeServices } from "@workspace/db";
import { CreateEmployeeBody, CreateStaffInvitationBody, SaveOrganizationMembershipBody } from "@workspace/api-zod";
import { allowRoles } from "../middlewares/authentication";
import { input, uuid, tenantId, validHours, emailOrEmpty } from "../lib/input";
import { HttpError } from "../lib/http-error";
import { workspace } from "../services/workspace";

export const staffRouter: IRouter = Router({ mergeParams: true });
staffRouter.use(allowRoles("owner", "manager"));
async function saveEmployee(req: Request, create: boolean) {
  const orgId = tenantId(req);
  const data = input(CreateEmployeeBody.strict(), req.body);
  data.displayName = data.displayName.trim();
  data.email = data.email.trim().toLowerCase();
  if (!data.displayName) throw new HttpError(400, "Name der Fachkraft fehlt.");
  emailOrEmpty(data.email); validHours(data.workingHours);
  const [location] = await db.select().from(locations).where(and(eq(locations.id, data.locationId), eq(locations.organizationId, orgId)));
  if (!location) throw new HttpError(400, "Standort gehört nicht zu diesem Unternehmen.");
  const employeeId = create ? undefined : uuid(req.params.employeeId);
  const [existing] = employeeId ? await db.select().from(employees).where(and(eq(employees.id, employeeId), eq(employees.organizationId, orgId))) : [];
  if (!create && !existing) throw new HttpError(404, "Mitarbeiterprofil nicht gefunden.");
  await db.transaction(async (tx) => {
    if (existing) {
      if (existing.locationId !== data.locationId) {
        const [assignment] = await tx.select().from(employeeServices).where(eq(employeeServices.employeeId, existing.id)).limit(1);
        if (assignment) throw new HttpError(400, "Vor dem Standortwechsel bitte bestehende Leistungszuordnungen entfernen.");
      }
      if (!data.active && existing.userId) {
        const [member] = await tx.select().from(memberships).where(and(eq(memberships.userId, existing.userId), eq(memberships.organizationId, orgId)));
        if (member?.role === "owner") throw new HttpError(400, "Der Inhaber kann nicht deaktiviert werden.");
        if (member) await tx.update(memberships).set({ status: "inactive" }).where(eq(memberships.id, member.id));
      }
      await tx.update(employees).set(data).where(eq(employees.id, existing.id));
      await tx.insert(auditEvents).values({ organizationId: orgId, actorId: req.identity!.id, action: data.active ? "employee.updated" : "employee.deactivated", targetId: existing.id });
    } else {
      await tx.insert(employees).values({ ...data, organizationId: orgId });
    }
  });
}
staffRouter.post("/employees", async (req, res): Promise<void> => {
  await saveEmployee(req, true);
  res.status(201).json(await workspace(tenantId(req), req.organizationRole!, req.identity!.id));
});
staffRouter.put("/employees/:employeeId", async (req, res): Promise<void> => {
  await saveEmployee(req, false);
  res.json(await workspace(tenantId(req), req.organizationRole!, req.identity!.id));
});
staffRouter.post("/invitations", async (req, res): Promise<void> => {
  const orgId = tenantId(req);
  const data = input(CreateStaffInvitationBody.strict(), req.body);
  if (req.organizationRole !== "owner" && data.role !== "employee") throw new HttpError(403, "Nur Inhaber dürfen Manager einladen.");
  const [location] = await db.select().from(locations).where(and(eq(locations.id, data.locationId), eq(locations.organizationId, orgId)));
  if (!location) throw new HttpError(400, "Ungültiger Standort.");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 72 * 3600_000);
  await db.transaction(async (tx) => {
    const [invitation] = await tx.insert(staffInvitations).values({
      ...data, email: data.email.trim().toLowerCase(), organizationId: orgId, createdBy: req.identity!.id,
      expiresAt, tokenHash: createHash("sha256").update(token).digest("hex"),
    }).returning();
    await tx.insert(auditEvents).values({ organizationId: orgId, actorId: req.identity!.id, action: "invitation.created", targetId: invitation!.id });
  });
  res.setHeader("Cache-Control", "no-store");
  res.status(201).json({ token, expiresAt: expiresAt.toISOString(), message: "Link einmalig kopieren und sicher manuell teilen. Es wurde keine E-Mail versandt. Nur die eingeladene verifizierte Adresse kann ihn annehmen." });
});
staffRouter.put("/members/:membershipId", allowRoles("owner"), async (req, res): Promise<void> => {
  const orgId = tenantId(req);
  const data = input(SaveOrganizationMembershipBody.strict(), req.body);
  await db.transaction(async (tx) => {
    await tx.select().from(organizations).where(eq(organizations.id, orgId)).for("update");
    const [member] = await tx.select().from(memberships).where(and(eq(memberships.id, uuid(req.params.membershipId)), eq(memberships.organizationId, orgId)));
    if (!member) throw new HttpError(404, "Mitgliedschaft nicht gefunden.");
    if (member.role === "owner" || member.userId === req.identity!.id) throw new HttpError(400, "Eigene Inhaberrechte können hier nicht geändert werden.");
    await tx.update(memberships).set(data).where(eq(memberships.id, member.id));
    await tx.update(employees).set({ active: data.status === "active" }).where(and(eq(employees.userId, member.userId), eq(employees.organizationId, orgId)));
    await tx.insert(auditEvents).values({ organizationId: orgId, actorId: req.identity!.id, action: "membership.changed", targetId: member.id });
  });
  res.json(await workspace(orgId, req.organizationRole!, req.identity!.id));
});
