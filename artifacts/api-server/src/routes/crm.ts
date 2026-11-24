import { raw, Router, type IRouter } from "express";
import { and, asc, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { auditEvents, crmAppointmentLinks, crmAttachments, crmCustomers, db, locations, reservations, users } from "@workspace/db";
import { allowRoles, requireAuthentication, requireOrganization } from "../middlewares/authentication";
import { HttpError } from "../lib/http-error";
import { input, tenantId, uuid } from "../lib/input";
import { literalPattern } from "../repositories/catalog";

export const crmRouter: IRouter = Router();
const path = "/organizations/:organizationId/crm-customers" as const;
crmRouter.use(path, requireAuthentication, requireOrganization, allowRoles("owner", "manager"));
const fields = {
  id: crmCustomers.id, name: crmCustomers.name, email: crmCustomers.email, phone: crmCustomers.phone,
  contactPreference: crmCustomers.contactPreference, notes: crmCustomers.notes, tags: crmCustomers.tags,
  revision: crmCustomers.revision, updatedAt: crmCustomers.updatedAt,
};
const dataInput = z.strictObject({
  name: z.string().trim().min(1).max(100), email: z.union([z.literal(""), z.email().max(254)]),
  phone: z.string().trim().max(50), notes: z.string().trim().max(8000),
  contactPreference: z.enum(["none", "phone", "email"]),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).transform((tags) => [...new Set(tags)]),
});
const owned = (id: string, orgId: string) => and(eq(crmCustomers.id, id), eq(crmCustomers.organizationId, orgId));
const missing = () => new HttpError(404, "Kundenprofil nicht gefunden.");

const completedVisitCount = sql<number>`(
  select count(*)::int from ${crmAppointmentLinks} as visit_link
  join ${reservations} as visit_booking on visit_booking.id = visit_link.booking_id
  join ${locations} as visit_location on visit_location.id = visit_booking.location_id
  where visit_link.customer_id = ${crmCustomers}."id"
    and visit_location.organization_id = ${crmCustomers}."organization_id" and visit_booking.status = 'completed'
)`;

crmRouter.get(path, async (req, res) => {
  const { q, tag, minVisits } = input(z.strictObject({
    q: z.string().trim().max(100).optional(), tag: z.string().trim().max(40).optional(),
    minVisits: z.string().regex(/^\d{1,4}$/).transform(Number).optional(),
  }), req.query);
  const pattern = q ? literalPattern(q) : undefined;
  res.json(await db.select({ ...fields, completedVisits: completedVisitCount }).from(crmCustomers).where(and(eq(crmCustomers.organizationId, tenantId(req)),
    pattern ? or(ilike(crmCustomers.name, pattern), ilike(crmCustomers.email, pattern), ilike(crmCustomers.phone, pattern)) : undefined,
    tag ? sql`${tag} = any(${crmCustomers.tags})` : undefined,
    minVisits ? sql`${completedVisitCount} >= ${minVisits}` : undefined))
    .orderBy(asc(crmCustomers.name), asc(crmCustomers.id)).limit(100));
});
crmRouter.post(path, async (req, res) => {
  const organizationId = tenantId(req);
  const data = input(dataInput, req.body);
  const customer = await db.transaction(async (tx) => {
    const [created] = await tx.insert(crmCustomers).values({ ...data, organizationId }).returning(fields);
    if (!created) throw new Error("CRM insert returned no row");
    await tx.insert(auditEvents).values({ actorId: req.identity!.id, organizationId, action: "crm.customer_created", targetId: created.id });
    return created;
  });
  res.status(201).json(customer);
});
crmRouter.put(`${path}/:id`, async (req, res) => {
  const id = uuid(req.params.id);
  const organizationId = tenantId(req);
  const { revision, ...data } = input(dataInput.extend({ revision: z.number().int().nonnegative() }), req.body);
  const customer = await db.transaction(async (tx) => {
    const [updated] = await tx.update(crmCustomers).set({ ...data, revision: revision + 1, updatedAt: new Date() })
      .where(and(owned(id, organizationId), eq(crmCustomers.revision, revision))).returning(fields);
    if (!updated) {
      const [existing] = await tx.select({ id: crmCustomers.id }).from(crmCustomers).where(owned(id, organizationId));
      if (!existing) throw missing();
      throw new HttpError(409, "Das Kundenprofil wurde zwischenzeitlich geändert. Bitte lade es erneut.");
    }
    await tx.insert(auditEvents).values({ actorId: req.identity!.id, organizationId, action: "crm.customer_updated", targetId: id });
    return updated;
  });
  res.json(customer);
});

const dates = { bookingId: reservations.id, startsAt: reservations.startsAt, status: reservations.status,
  salon: locations.name, timezone: locations.timezone, items: reservations.items };

crmRouter.get(`${path}/:id/appointments`, async (req, res) => {
  const id = uuid(req.params.id);
  const organizationId = tenantId(req);
  const [customer] = await db.select({ id: crmCustomers.id }).from(crmCustomers).where(owned(id, organizationId));
  if (!customer) throw missing();
  const [history, candidates] = await Promise.all([
    db.select(dates).from(crmAppointmentLinks).innerJoin(reservations, eq(reservations.id, crmAppointmentLinks.bookingId))
      .innerJoin(locations, eq(locations.id, reservations.locationId))
      .where(and(eq(crmAppointmentLinks.customerId, id), eq(locations.organizationId, organizationId)))
      .orderBy(desc(reservations.startsAt)).limit(100),
    db.select({ ...dates, name: sql<string>`coalesce(${reservations.guestName}, ${users.displayName})` })
      .from(reservations).innerJoin(locations, eq(locations.id, reservations.locationId)).leftJoin(users, eq(users.id, reservations.userId))
      .leftJoin(crmAppointmentLinks, eq(crmAppointmentLinks.bookingId, reservations.id))
      .where(and(eq(locations.organizationId, organizationId), isNull(crmAppointmentLinks.bookingId)))
      .orderBy(desc(reservations.startsAt)).limit(100),
  ]);
  res.json({ history, candidates });
});

crmRouter.put(`${path}/:id/appointments/:bookingId`, async (req, res) => {
  const id = uuid(req.params.id);
  const bookingId = uuid(req.params.bookingId);
  const organizationId = tenantId(req);
  await db.transaction(async (tx) => {
    const [customer] = await tx.select({ id: crmCustomers.id }).from(crmCustomers).where(owned(id, organizationId)).for("share");
    if (!customer) throw missing();
    const [booking] = await tx.select({ id: reservations.id }).from(reservations)
      .innerJoin(locations, eq(locations.id, reservations.locationId))
      .where(and(eq(reservations.id, bookingId), eq(locations.organizationId, organizationId))).for("update", { of: reservations });
    if (!booking) throw new HttpError(404, "Termin nicht gefunden.");
    const [existing] = await tx.select().from(crmAppointmentLinks).where(eq(crmAppointmentLinks.bookingId, bookingId));
    if (existing?.customerId === id) return;
    if (existing) throw new HttpError(409, "Der Termin ist bereits einem Kundenprofil zugeordnet.");
    await tx.insert(crmAppointmentLinks).values({ customerId: id, bookingId });
    await tx.insert(auditEvents).values({ actorId: req.identity!.id, organizationId, action: "crm.appointment_linked", targetId: id });
  });
  res.status(204).end();
});

crmRouter.delete(`${path}/:id/appointments/:bookingId`, async (req, res) => {
  const id = uuid(req.params.id);
  const bookingId = uuid(req.params.bookingId);
  const organizationId = tenantId(req);
  const [customer] = await db.select({ id: crmCustomers.id }).from(crmCustomers).where(owned(id, organizationId));
  if (!customer) throw missing();
  await db.delete(crmAppointmentLinks).where(and(eq(crmAppointmentLinks.bookingId, bookingId), eq(crmAppointmentLinks.customerId, id)));
  res.status(204).end();
});

const documentPath = `${path}/:id/attachments` as const;
const attachmentFields = { id: crmAttachments.id, name: crmAttachments.name, createdAt: crmAttachments.createdAt };
const pdfLimit = 768 * 1024;

crmRouter.get(documentPath, async (req, res) => {
  const id = uuid(req.params.id);
  const organizationId = tenantId(req);
  const [customer] = await db.select({ id: crmCustomers.id }).from(crmCustomers).where(owned(id, organizationId));
  if (!customer) throw missing();
  res.json(await db.select(attachmentFields).from(crmAttachments).where(eq(crmAttachments.customerId, id))
    .orderBy(desc(crmAttachments.createdAt), desc(crmAttachments.id)));
});

crmRouter.post(documentPath, raw({ type: "application/pdf", limit: pdfLimit, inflate: false }), async (req, res) => {
  let name: string;
  try { name = decodeURIComponent(req.get("X-Attachment-Name") ?? "").trim(); }
  catch { throw new HttpError(400, "Ungültiger Dateiname."); }
  const content: unknown = req.body;
  if (!/^[\p{L}\p{N} ._()-]{1,116}\.pdf$/iu.test(name) || !Buffer.isBuffer(content) ||
    !/^%PDF-\d\.\d/.test(content.subarray(0, 8).toString("ascii")) || !/%%EOF\s*$/.test(content.subarray(-1024).toString("latin1"))) {
    throw new HttpError(400, "Bitte eine PDF-Datei mit gültigem Namen hochladen.");
  }
  const id = uuid(req.params.id);
  const organizationId = tenantId(req);
  const attachment = await db.transaction(async (tx) => {
    const [customer] = await tx.select({ id: crmCustomers.id }).from(crmCustomers).where(owned(id, organizationId)).for("update");
    if (!customer) throw missing();
    const [total] = await tx.select({ value: count() }).from(crmAttachments).where(eq(crmAttachments.customerId, id));
    if ((total?.value ?? 0) >= 8) throw new HttpError(409, "Pro Kundenprofil sind höchstens acht Dokumente möglich.");
    const [created] = await tx.insert(crmAttachments).values({ customerId: id, name, content }).returning(attachmentFields);
    await tx.insert(auditEvents).values({ actorId: req.identity!.id, organizationId, action: "crm.attachment_created", targetId: id });
    return created;
  });
  res.status(201).json(attachment);
});

crmRouter.get(`${documentPath}/:attachmentId`, async (req, res) => {
  const [attachment] = await db.select({ name: crmAttachments.name, content: crmAttachments.content }).from(crmAttachments)
    .innerJoin(crmCustomers, eq(crmCustomers.id, crmAttachments.customerId))
    .where(and(eq(crmAttachments.id, uuid(req.params.attachmentId)), owned(uuid(req.params.id), tenantId(req))));
  if (!attachment) throw new HttpError(404, "Dokument nicht gefunden.");
  res.set("Cache-Control", "no-store").attachment(attachment.name).type("application/pdf").send(attachment.content);
});

crmRouter.delete(`${documentPath}/:attachmentId`, async (req, res) => {
  const id = uuid(req.params.id);
  const organizationId = tenantId(req);
  await db.transaction(async (tx) => {
    const [removed] = await tx.delete(crmAttachments).where(and(eq(crmAttachments.id, uuid(req.params.attachmentId)),
      eq(crmAttachments.customerId, id), eq(crmAttachments.customerId, tx.select({ id: crmCustomers.id }).from(crmCustomers)
        .where(owned(id, organizationId))))).returning({ id: crmAttachments.id });
    if (!removed) throw new HttpError(404, "Dokument nicht gefunden.");
    await tx.insert(auditEvents).values({ actorId: req.identity!.id, organizationId, action: "crm.attachment_deleted", targetId: id });
  });
  res.status(204).end();
});
