import { publicLocation } from "../services/marketplace-visibility";
import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gt, inArray, isNull, lt, notInArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db, auditEvents, bookingReviews, bookingBlocks, bookingEvents, bookingResources, bookingResourceReservations,
  bookingServiceResources, bookingStaffReservations, bookingWaitlist, cancellationPolicies, employees, locations, loyaltyAwards, loyaltyPrograms, paymentReferences, reservations, services, users,
} from "@workspace/db";
import { input, tenantId, uuid } from "../lib/input";
import { HttpError } from "../lib/http-error";
import { simulatedPaymentProvider } from "../lib/payments";
import { allowRoles, requireAuthentication, requireOrganization } from "../middlewares/authentication";
import { availability, bookingLocation } from "../services/booking-availability";
import { bookingCalendarFile } from "../services/booking-calendar-file";
import { recordBookingEvent } from "../services/booking-notifications";
import { persistBooking } from "../services/booking-persistence";
import type { BookingTransaction } from "../services/booking-quote";
import { estimatedFeeCents, isLateCancellation } from "../services/booking-policy";
import { dateNumber, localClock, minute } from "../services/booking-time";

export const bookingRouter: IRouter = Router();
const slugSchema = z.string().regex(/^[a-z0-9-]{1,100}$/);
const selection = z.array(z.strictObject({ serviceId: z.uuid(), variantId: z.uuid().optional() })).min(1).max(12);
const instant = z.iso.datetime().transform((value) => new Date(value));
const notFound = () => new HttpError(404, "Termin nicht gefunden.");
const conflict = () => new HttpError(409, "Dieser Termin ist nicht mehr verfügbar.", "BOOKING_CONFLICT");
const rescheduleNotice = sql<number>`coalesce((${reservations.policySnapshot}->>'rescheduleNoticeHours')::int, 0)`;
const view = {
  rescheduleNoticeHours: rescheduleNotice,
  id: reservations.id, locationId: reservations.locationId, employeeId: reservations.employeeId,
  startsAt: reservations.startsAt, endsAt: reservations.endsAt, status: reservations.status,
  items: reservations.items, appointmentNote: reservations.appointmentNote, priceCents: reservations.priceCents, durationMinutes: reservations.durationMinutes,
};
function bookingView(row: typeof reservations.$inferSelect) {
  return { id: row.id, locationId: row.locationId, employeeId: row.employeeId, startsAt: row.startsAt,
    endsAt: row.endsAt, status: row.status, items: row.items, appointmentNote: row.appointmentNote, rescheduleNoticeHours: row.policySnapshot.rescheduleNoticeHours ?? 0, priceCents: row.priceCents, durationMinutes: row.durationMinutes };
}
function pgCode(error: unknown): string | undefined {
  if (typeof error !== "object" || !error) return undefined;
  return "code" in error && typeof error.code === "string" ? error.code : pgCode("cause" in error ? error.cause : undefined);
}

async function notifyWaitlist(tx: BookingTransaction, locationId: string, startsAt: Date) {
  const [location] = await tx.select({ timezone: locations.timezone }).from(locations).where(eq(locations.id, locationId));
  if (!location) return;
  await tx.update(bookingWaitlist).set({ openedAt: new Date() }).where(and(
    eq(bookingWaitlist.locationId, locationId), eq(bookingWaitlist.date, localClock(location.timezone)(+startsAt).date),
  ));
}

bookingRouter.post("/businesses/:slug/available-dates", async (req, res) => {
  const { items, from } = input(z.strictObject({ items: selection, from: z.iso.date() }), req.body);
  const slug = input(slugSchema, req.params.slug);
  const dates = await db.transaction(async (tx) => {
    const location = await bookingLocation(tx, slug);
    const now = new Date();
    const start = dateNumber(from);
    const dates: { date: string; available: boolean }[] = [];
    for (let offset = 0; offset < 7; offset++) {
      const date = new Date(start + offset * 86400000).toISOString().slice(0, 10);
      const { slots } = await availability(tx, location, items, date, now, undefined, { firstOnly: true });
      dates.push({ date, available: slots.length > 0 });
    }
    return dates;
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  res.set("Cache-Control", "no-store").json(dates);
});

bookingRouter.post("/businesses/:slug/availability", async (req, res) => {
  const { items, date, professionalId } = input(z.strictObject({ items: selection, date: z.iso.date(), professionalId: z.uuid().optional() }), req.body);
  const slug = input(slugSchema, req.params.slug);
  const result = await db.transaction(async (tx) => {
    const location = await bookingLocation(tx, slug);
    if (professionalId && !location.allowProfessionalChoice) throw new HttpError(400, "Dieses Studio vergibt Teammitglieder automatisch.");
    const { quote, slots } = await availability(tx, location, items, date, new Date(), undefined, { professionalId });
    const shownSlots = location.allowProfessionalChoice ? slots
      : slots.filter((slot, index) => index === 0 || slots[index - 1]?.startsAt !== slot.startsAt);
    const [policy] = await tx.select().from(cancellationPolicies).where(eq(cancellationPolicies.organizationId, location.organizationId))
      .orderBy(desc(cancellationPolicies.version)).limit(1);
    return { quote, slots: shownSlots, professionalChoice: { individual: location.allowProfessionalChoice, any: location.allowAnyProfessional }, policy: policy ? {
      version: policy.version, noticeHours: policy.noticeHours, rescheduleNoticeHours: policy.rescheduleNoticeHours, lateFeeType: policy.lateFeeType, lateFeeValue: policy.lateFeeValue,
      noShowFeeType: policy.noShowFeeType, noShowFeeValue: policy.noShowFeeValue, exceptions: policy.exceptions,
    } : null };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  res.set("Cache-Control", "no-store").json(result);
});

bookingRouter.post("/businesses/:slug/bookings", requireAuthentication, async (req, res) => {
  const slug = input(slugSchema, req.params.slug);
  const data = input(z.strictObject({
    items: selection, employeeId: z.uuid(), startsAt: instant, idempotencyKey: z.uuid(),
    policyVersion: z.number().int().positive(), expectedPriceCents: z.number().int().nonnegative(),
    appointmentNote: z.string().trim().max(500).optional(), paymentMethodId: z.uuid(), acceptPolicy: z.literal(true), expectedEndsAt: instant.optional(), expectedProfessionals: z.array(z.uuid()).min(1).max(12).optional(),
  }), req.body);
  const userId = req.identity!.id;
  const key = and(eq(reservations.userId, userId), eq(reservations.idempotencyKey, data.idempotencyKey));
  const requestHash = createHash("sha256").update(JSON.stringify({ slug, ...data })).digest("hex");
  const replay = (row: typeof reservations.$inferSelect) => {
    if (row.requestHash !== requestHash) throw new HttpError(409, "Dieser Buchungsschlüssel wurde bereits verwendet.");
    return bookingView(row);
  };
  try {
    const result = await db.transaction(async (tx) => {
      const [prior] = await tx.select().from(reservations).where(key);
      if (prior) return { created: false, value: replay(prior) };
      const location = await bookingLocation(tx, slug, true);
      const [existing] = await tx.select().from(reservations).where(key);
      if (existing) return { created: false, value: replay(existing) };
      const [method] = await tx.select({ id: paymentReferences.id }).from(paymentReferences).where(and(
        eq(paymentReferences.id, data.paymentMethodId), eq(paymentReferences.userId, userId),
        eq(paymentReferences.provider, simulatedPaymentProvider), eq(paymentReferences.status, "active"),
      ));
      if (!method) throw new HttpError(412, "Speichere zuerst eine simulierte Zahlungsmethode.");
      const now = new Date();
      const date = localClock(location.timezone)(+data.startsAt).date;
      const { slots, resourceIds } = await availability(tx, location, data.items, date, now);
      const atTime = slots.filter((candidate) => candidate.startsAt === data.startsAt.toISOString());
      const slot = location.allowProfessionalChoice ? atTime.find((candidate) => candidate.employeeId === data.employeeId) : atTime[0];
      if (!slot || slot.employeeId !== data.employeeId || (slot.mixed && !data.expectedProfessionals)) throw conflict();
      if (data.expectedProfessionals && (data.expectedProfessionals.length !== slot.quote.items.length ||
        slot.quote.items.some((line, position) => line.employeeId !== data.expectedProfessionals?.[position]))) throw conflict();
      const quote = slot.quote;
      const [policy] = await tx.select().from(cancellationPolicies).where(eq(cancellationPolicies.organizationId, location.organizationId))
        .orderBy(desc(cancellationPolicies.version)).limit(1);
      if (!policy || policy.version !== data.policyVersion || quote.priceCents !== data.expectedPriceCents ||
        (data.expectedEndsAt && data.expectedEndsAt.toISOString() !== slot.endsAt)) {
        throw new HttpError(409, "Preis, Dauer oder Buchungsbedingungen wurden geändert. Bitte prüfe den aktuellen Stand.");
      }
      const endsAt = new Date(slot.endsAt);
      const created = await persistBooking(tx, {
        userId, paymentMethodId: method.id, locationId: location.id, employeeId: data.employeeId, idempotencyKey: data.idempotencyKey, requestHash,
        startsAt: data.startsAt, endsAt, items: quote.items, appointmentNote: data.appointmentNote || null, priceCents: quote.priceCents, durationMinutes: quote.durationMinutes,
        policyVersion: policy.version, policyNoticeHours: policy.noticeHours, policySnapshot: policy,
      }, resourceIds);
      return { created: true, value: bookingView(created) };
    });
    res.status(result.created ? 201 : 200).json(result.value);
  } catch (error) {
    if (pgCode(error) === "23505") {
      const [prior] = await db.select().from(reservations).where(key);
      if (prior) { res.json(replay(prior)); return; }
    }
    if (pgCode(error) === "23P01") throw conflict();
    throw error;
  }
});

bookingRouter.use("/me/bookings", requireAuthentication);
bookingRouter.get("/me/bookings", async (req, res) => {
  res.json(await db.select({ ...view, salon: locations.name, slug: locations.slug, timezone: locations.timezone,
    reviewRating: bookingReviews.rating })
    .from(reservations).innerJoin(locations, eq(locations.id, reservations.locationId))
    .leftJoin(bookingReviews, eq(bookingReviews.bookingId, reservations.id))
    .where(eq(reservations.userId, req.identity!.id)).orderBy(desc(reservations.startsAt)).limit(100));
});

bookingRouter.post("/me/bookings/:id/review", async (req, res) => {
  const id = uuid(req.params.id);
  const data = input(z.strictObject({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(2000),
  }), req.body);
  const review = await db.transaction(async (tx) => {
    const [booking] = await tx.select({ status: reservations.status }).from(reservations)
      .where(and(eq(reservations.id, id), eq(reservations.userId, req.identity!.id))).for("update");
    if (!booking) throw notFound();
    if (booking.status !== "completed") throw new HttpError(409, "Nur abgeschlossene Termine können bewertet werden.");
    const [created] = await tx.insert(bookingReviews).values({ ...data, bookingId: id, published: new Date() })
      .onConflictDoNothing({ target: bookingReviews.bookingId })
      .returning({ rating: bookingReviews.rating });
    if (!created) throw new HttpError(409, "Dieser Termin wurde bereits bewertet.");
    return created;
  });
  res.status(201).json(review);
});

bookingRouter.get("/me/bookings/:id/calendar.ics", async (req, res) => {
  const id = uuid(req.params.id);
  const [result] = await db.select({
    row: reservations, location: locations,
    sequence: sql<number>`(select count(*)::int from ${bookingEvents}
      where ${bookingEvents.bookingId} = ${reservations.id}
      and ${bookingEvents.kind} in ('rescheduled', 'cancelled'))`,
    stamp: sql<string>`coalesce((select max(${bookingEvents.createdAt}) from ${bookingEvents}
      where ${bookingEvents.bookingId} = ${reservations.id}), ${reservations.createdAt})::text`,
  }).from(reservations).innerJoin(locations, eq(locations.id, reservations.locationId))
    .where(and(eq(reservations.id, id), eq(reservations.userId, req.identity!.id)));
  if (!result) throw notFound();
  const { row, location, stamp, sequence } = result;
  const address = [location.address, location.addressExtra, [location.postalCode, location.city].filter(Boolean).join(" "), location.country]
    .filter(Boolean).join(", ");
  res.type("text/calendar").attachment("beautyhub-" + id + ".ics").send(bookingCalendarFile({
    id, salon: location.name, address, startsAt: row.startsAt, endsAt: row.endsAt, stamp: new Date(stamp), sequence,
    services: row.items.map((line) => [line.name, line.variantName, line.professionalName].filter(Boolean).join(" - ")),
    cancelled: row.status === "cancelled",
  }));
});

bookingRouter.get("/me/bookings/:id/events", async (req, res) => {
  const id = uuid(req.params.id);
  const [row] = await db.select({ id: reservations.id }).from(reservations)
    .where(and(eq(reservations.id, id), eq(reservations.userId, req.identity!.id)));
  if (!row) throw notFound();
  res.json(await db.select({ kind: bookingEvents.kind, createdAt: bookingEvents.createdAt, estimatedFeeCents: bookingEvents.estimatedFeeCents })
    .from(bookingEvents).where(and(eq(bookingEvents.bookingId, id), notInArray(bookingEvents.kind, ["reminder", "follow_up"]))).orderBy(asc(bookingEvents.createdAt)));
});

bookingRouter.post("/me/bookings/:id/cancel", async (req, res) => {
  const id = uuid(req.params.id);
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(reservations)
      .where(and(eq(reservations.id, id), eq(reservations.userId, req.identity!.id))).for("update");
    if (!row) throw notFound();
    if (row.status === "cancelled") return;
    if (row.status !== "confirmed" || +row.startsAt <= Date.now()) throw new HttpError(409, "Dieser Termin kann nicht mehr storniert werden.");
    await tx.update(reservations).set({ status: "cancelled" }).where(eq(reservations.id, id));
    await tx.delete(bookingResourceReservations).where(eq(bookingResourceReservations.bookingId, id));
    const policy = row.policySnapshot;
    const estimate = isLateCancellation(row.startsAt, new Date(), row.policyNoticeHours)
      ? estimatedFeeCents(row.priceCents, { kind: policy.lateFeeType, value: policy.lateFeeValue }) : 0;
    await recordBookingEvent(tx, row, "cancelled", estimate);
    await notifyWaitlist(tx, row.locationId, row.startsAt);
  });
  res.status(204).end();
});

bookingRouter.post("/me/bookings/:id/availability", async (req, res) => {
  const { date } = input(z.strictObject({ date: z.iso.date() }), req.body);
  const result = await db.transaction(async (tx) => {
    const [reference] = await tx.select({ slug: locations.slug, items: reservations.items, startsAt: reservations.startsAt, endsAt: reservations.endsAt, rescheduleNoticeHours: rescheduleNotice }).from(reservations)
      .innerJoin(locations, eq(locations.id, reservations.locationId))
      .where(and(eq(reservations.id, uuid(req.params.id)), eq(reservations.userId, req.identity!.id), eq(reservations.status, "confirmed")));
    if (!reference) throw notFound();
    assertRescheduleNotice(reference.startsAt, reference.rescheduleNoticeHours, new Date());
    const location = await bookingLocation(tx, reference.slug);
    const items = reference.items.map(({ serviceId, variantId }) => ({ serviceId, variantId: variantId ?? undefined }));
    const { quote, slots } = await availability(tx, location, items, date, new Date(), req.params.id, { fixedLines: reference.items });
    return { quote, slots: slots.filter((slot) => slot.quote.occupiedMinutes * minute === +reference.endsAt - +reference.startsAt), policy: null };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  res.json(result);
});

function assertRescheduleNotice(startsAt: Date, hours: number, now: Date) {
  if (isLateCancellation(startsAt, now, hours)) throw new HttpError(409,
    `Online-Umbuchungen sind bis ${hours} Stunden vor Terminbeginn möglich. Bitte wende dich an das Studio.`, "RESCHEDULE_NOTICE");
}

const moveInput = z.strictObject({ startsAt: instant, employeeId: z.uuid() });

async function moveBooking(scope: SQL, startsAt: Date, employeeId: string, actor?: { organizationId: string; userId: string; expectedStartsAt: Date; expectedEmployeeId: string }) {
  try {
    return await db.transaction(async (tx) => {
      const [reference] = await tx.select({ slug: locations.slug, locationId: locations.id, bookingId: reservations.id }).from(reservations)
        .innerJoin(locations, eq(locations.id, reservations.locationId)).where(scope);
      if (!reference) throw notFound();
      const location = actor
        ? await tenantBookingLocation(tx, reference.locationId, actor.organizationId, true)
        : await bookingLocation(tx, reference.slug, true);
      const [row] = await tx.select().from(reservations).where(eq(reservations.id, reference.bookingId)).for("update");
      if (!row) throw notFound();
      const now = new Date();
      if (row.status !== "confirmed" || +row.startsAt <= +now) throw conflict();
      if (!actor) assertRescheduleNotice(row.startsAt, row.policySnapshot.rescheduleNoticeHours ?? 0, now);
      if (+row.startsAt === +startsAt && row.employeeId === employeeId) return bookingView(row);
      if (actor && (+row.startsAt !== +actor.expectedStartsAt || row.employeeId !== actor.expectedEmployeeId)) {
        throw new HttpError(409, "Der Termin wurde zwischenzeitlich geändert. Bitte lade den Kalender neu.");
      }
      const items = row.items.map(({ serviceId, variantId }) => ({ serviceId, variantId: variantId ?? undefined }));
      const date = localClock(location.timezone)(+startsAt).date;
      const { slots, resourceIds } = await availability(tx, location, items, date, now, row.id,
        { internalMode: actor ? "manual" : undefined, fixedLines: row.items });
      const slot = slots.find((candidate) => candidate.employeeId === employeeId && candidate.startsAt === startsAt.toISOString());
      if (!slot || slot.quote.occupiedMinutes * minute !== +row.endsAt - +row.startsAt) throw conflict();
      const endsAt = new Date(slot.endsAt);
      await tx.delete(bookingResourceReservations).where(eq(bookingResourceReservations.bookingId, row.id));
      if (resourceIds.length) await tx.insert(bookingResourceReservations).values(resourceIds.map((resourceId) => ({ bookingId: row.id, resourceId, startsAt, endsAt })));
      const itemsSnapshot = slot.quote.items;
      const [updated] = await tx.update(reservations).set({ startsAt, endsAt, employeeId, items: itemsSnapshot }).where(eq(reservations.id, row.id)).returning();
      await recordBookingEvent(tx, updated!, "rescheduled");
      await notifyWaitlist(tx, row.locationId, row.startsAt);
      if (actor) await tx.insert(auditEvents).values({ organizationId: actor.organizationId, actorId: actor.userId,
        action: "booking.rescheduled_in_calendar", targetId: row.id });
      return bookingView(updated!);
    });
  } catch (error) {
    if (pgCode(error) === "23P01") throw conflict();
    throw error;
  }
}

bookingRouter.post("/me/bookings/:id/reschedule", async (req, res) => {
  const id = uuid(req.params.id);
  const { startsAt, employeeId } = input(moveInput, req.body);
  const owner = and(eq(reservations.id, id), eq(reservations.userId, req.identity!.id));
  res.json(await moveBooking(owner!, startsAt, employeeId));
});

bookingRouter.post("/businesses/:slug/waitlist", requireAuthentication, async (req, res) => {
  const slug = input(slugSchema, req.params.slug);
  const { date } = input(z.strictObject({ date: z.iso.date() }), req.body);
  await db.transaction(async (tx) => {
    const location = await bookingLocation(tx, slug);
    const today = dateNumber(localClock(location.timezone)(Date.now()).date);
    if (dateNumber(date) < today || dateNumber(date) > today + location.advanceBookingDays * 86400000) throw new HttpError(400, "Datum liegt außerhalb des Buchungszeitraums.");
    await tx.insert(bookingWaitlist).values({ locationId: location.id, userId: req.identity!.id, date }).onConflictDoNothing();
  });
  res.status(204).end();
});

bookingRouter.use("/me/booking-waitlist", requireAuthentication);
bookingRouter.get("/me/booking-waitlist", async (req, res) => {
  res.json(await db.select({ locationId: locations.id, salon: locations.name, slug: locations.slug,
    date: bookingWaitlist.date, openedAt: bookingWaitlist.openedAt })
    .from(bookingWaitlist).innerJoin(locations, eq(locations.id, bookingWaitlist.locationId))
    .where(and(eq(bookingWaitlist.userId, req.identity!.id), publicLocation))
    .orderBy(desc(bookingWaitlist.createdAt)).limit(100));
});

bookingRouter.delete("/me/booking-waitlist/:locationId/:date", async (req, res) => {
  await db.delete(bookingWaitlist).where(and(eq(bookingWaitlist.userId, req.identity!.id),
    eq(bookingWaitlist.locationId, uuid(req.params.locationId)), eq(bookingWaitlist.date, input(z.iso.date(), req.params.date))));
  res.status(204).end();
});

const calendar = "/organizations/:organizationId/booking-calendar" as const;
bookingRouter.use(calendar, requireAuthentication, requireOrganization, allowRoles("owner", "manager"));
bookingRouter.get(calendar, async (req, res) => {
  const { from, to } = input(z.strictObject({ from: instant, to: instant }), req.query);
  if (+from >= +to || +to - +from > 93 * 86400000) throw new HttpError(400, "Ungültiger Kalenderzeitraum.");
  res.json(await db.select({ ...view, salon: locations.name, employeeName: employees.displayName, customerName: sql<string>`coalesce(${reservations.guestName}, ${users.displayName})`, source: reservations.source, timezone: locations.timezone })
    .from(reservations).innerJoin(locations, eq(locations.id, reservations.locationId))
    .innerJoin(employees, eq(employees.id, reservations.employeeId))
    .leftJoin(users, eq(users.id, reservations.userId))
    .where(and(eq(locations.organizationId, tenantId(req)), lt(reservations.startsAt, to), gt(reservations.endsAt, from)))
    .orderBy(asc(reservations.startsAt)));
});

const internalSelection = { locationId: z.uuid(), items: selection };
const internalMode = z.enum(["manual", "walk_in"]);

async function tenantBookingLocation(tx: BookingTransaction, locationId: string, organizationId: string, lock = false) {
  const query = tx.select().from(locations).where(and(eq(locations.id, locationId), eq(locations.organizationId, organizationId)));
  const [location] = await (lock ? query.for("update") : query);
  if (!location) throw new HttpError(404, "Standort nicht gefunden.");
  return location;
}

bookingRouter.post(`${calendar}/availability`, async (req, res) => {
  const { locationId, items, date, source } = input(z.strictObject({ ...internalSelection, date: z.iso.date(), source: internalMode }), req.body);
  const result = await db.transaction(async (tx) => {
    const location = await tenantBookingLocation(tx, locationId, tenantId(req));
    const now = new Date();
    if (source === "walk_in" && date !== localClock(location.timezone)(+now).date) {
      throw new HttpError(400, "Laufkundschaft kann nur für heute eingetragen werden.");
    }
    const { quote, slots } = await availability(tx, location, items, date, now, undefined, { internalMode: source });
    return { quote, slots, policy: null };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  res.json(result);
});

bookingRouter.post(calendar, async (req, res) => {
  const data = input(z.strictObject({
    ...internalSelection, employeeId: z.uuid(), startsAt: instant, idempotencyKey: z.uuid(),
    guestName: z.string().trim().min(1).max(100), source: internalMode,
  }), req.body);
  const organizationId = tenantId(req);
  const requestHash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  try {
    const result = await db.transaction(async (tx) => {
      const location = await tenantBookingLocation(tx, data.locationId, organizationId, true);
      const [prior] = await tx.select().from(reservations).where(and(
        eq(reservations.locationId, location.id), eq(reservations.idempotencyKey, data.idempotencyKey), isNull(reservations.userId),
      ));
      if (prior) {
        if (prior.requestHash !== requestHash) throw new HttpError(409, "Dieser Buchungsschlüssel wurde bereits verwendet.");
        return { created: false, booking: prior };
      }
      const now = new Date();
      const clock = localClock(location.timezone);
      const date = clock(+data.startsAt).date;
      if (data.source === "walk_in" && date !== clock(+now).date) throw new HttpError(400, "Laufkundschaft kann nur für heute eingetragen werden.");
      const { slots, resourceIds } = await availability(tx, location, data.items, date, now, undefined, { internalMode: data.source });
      const slot = slots.find((candidate) => candidate.employeeId === data.employeeId && candidate.startsAt === data.startsAt.toISOString());
      if (!slot) throw conflict();
      const quote = slot.quote;
      const [policy] = await tx.select().from(cancellationPolicies).where(eq(cancellationPolicies.organizationId, organizationId))
        .orderBy(desc(cancellationPolicies.version)).limit(1);
      if (!policy) throw new HttpError(409, "Für diesen Betrieb fehlen die Buchungsbedingungen.");
      const booking = await persistBooking(tx, {
        locationId: location.id, employeeId: data.employeeId, guestName: data.guestName, source: data.source,
        idempotencyKey: data.idempotencyKey, requestHash, startsAt: data.startsAt, endsAt: new Date(slot.endsAt),
        items: quote.items, priceCents: quote.priceCents, durationMinutes: quote.durationMinutes,
        policyVersion: policy.version, policyNoticeHours: policy.noticeHours, policySnapshot: policy,
      }, resourceIds);
      await tx.insert(auditEvents).values({ organizationId, actorId: req.identity!.id, action: "booking.created_in_calendar", targetId: booking.id });
      return { created: true, booking };
    });
    res.status(result.created ? 201 : 200).json(bookingView(result.booking));
  } catch (error) {
    if (pgCode(error) === "23P01") throw conflict();
    throw error;
  }
});

bookingRouter.post(`${calendar}/:id/availability`, async (req, res) => {
  const id = uuid(req.params.id);
  const organizationId = tenantId(req);
  const { date } = input(z.strictObject({ date: z.iso.date() }), req.body);
  const result = await db.transaction(async (tx) => {
    const [row] = await tx.select({ booking: reservations }).from(reservations)
      .innerJoin(locations, eq(locations.id, reservations.locationId))
      .where(and(eq(reservations.id, id), eq(locations.organizationId, organizationId)));
    if (!row) throw notFound();
    const booking = row.booking;
    const now = new Date();
    if (booking.status !== "confirmed" || +booking.startsAt <= +now) throw conflict();
    const location = await tenantBookingLocation(tx, booking.locationId, organizationId);
    const items = booking.items.map(({ serviceId, variantId }) => ({ serviceId, variantId: variantId ?? undefined }));
    const { slots } = await availability(tx, location, items, date, now, id, { internalMode: "manual", fixedLines: booking.items });
    return { slots: slots.filter((slot) => slot.quote.occupiedMinutes * minute === +booking.endsAt - +booking.startsAt) };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  res.json(result);
});

bookingRouter.post(`${calendar}/:id/reschedule`, async (req, res) => {
  const id = uuid(req.params.id);
  const organizationId = tenantId(req);
  const { startsAt, employeeId, expectedStartsAt, expectedEmployeeId } = input(moveInput.extend({
    expectedStartsAt: instant, expectedEmployeeId: z.uuid(),
  }), req.body);
  const scope = and(eq(reservations.id, id), eq(locations.organizationId, organizationId));
  res.json(await moveBooking(scope!, startsAt, employeeId, {
    organizationId, userId: req.identity!.id, expectedStartsAt, expectedEmployeeId,
  }));
});

bookingRouter.post(`${calendar}/:id/status`, async (req, res) => {
  const id = uuid(req.params.id);
  const { status } = input(z.strictObject({ status: z.enum(["cancelled", "completed", "no_show"]) }), req.body);
  const organizationId = tenantId(req);
  await db.transaction(async (tx) => {
    const [row] = await tx.select({ booking: reservations }).from(reservations)
      .innerJoin(locations, eq(locations.id, reservations.locationId))
      .where(and(eq(reservations.id, id), eq(locations.organizationId, organizationId))).for("update", { of: reservations });
    if (!row) throw notFound();
    if (row.booking.status === status) return;
    const threshold = status === "completed" ? row.booking.endsAt : row.booking.startsAt;
    if (row.booking.status !== "confirmed" || (status !== "cancelled" && +threshold > Date.now())) throw conflict();
    await tx.update(reservations).set({ status }).where(eq(reservations.id, id));
    await tx.delete(bookingResourceReservations).where(eq(bookingResourceReservations.bookingId, id));
    const policy = row.booking.policySnapshot;
    const estimate = status === "no_show" && row.booking.source === "online" ? estimatedFeeCents(row.booking.priceCents, { kind: policy.noShowFeeType, value: policy.noShowFeeValue }) : null;
    await recordBookingEvent(tx, row.booking, status, estimate);
    if (status !== "completed") await notifyWaitlist(tx, row.booking.locationId, row.booking.startsAt);
    if (status === "completed" && row.booking.userId) {
      const [program] = await tx.select({ points: loyaltyPrograms.pointsPerVisit }).from(loyaltyPrograms)
        .where(eq(loyaltyPrograms.organizationId, organizationId));
      if (program?.points) {
        await tx.insert(loyaltyAwards).values({ bookingId: id, userId: row.booking.userId, organizationId, points: program.points });
      }
    }
  });
  res.status(204).end();
});

bookingRouter.get(`${calendar}/waitlist`, async (req, res) => {
  res.json(await db.select({ locationId: bookingWaitlist.locationId, date: bookingWaitlist.date, salon: locations.name, createdAt: bookingWaitlist.createdAt })
    .from(bookingWaitlist).innerJoin(locations, eq(locations.id, bookingWaitlist.locationId))
    .where(eq(locations.organizationId, tenantId(req))).orderBy(desc(bookingWaitlist.createdAt)).limit(100));
});

const settings = "/organizations/:organizationId/locations/:locationId/booking-settings" as const;
bookingRouter.use(settings, requireAuthentication, requireOrganization, allowRoles("owner", "manager"));
bookingRouter.get(settings, async (req, res) => {
  const locationId = uuid(req.params.locationId);
  const [location] = await db.select({ id: locations.id }).from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.organizationId, tenantId(req))));
  if (!location) throw new HttpError(404, "Standort nicht gefunden.");
  const [blocks, resources] = await Promise.all([
    db.select().from(bookingBlocks).where(eq(bookingBlocks.locationId, locationId)).orderBy(asc(bookingBlocks.startsAt)),
    db.select().from(bookingResources).where(eq(bookingResources.locationId, locationId)).orderBy(asc(bookingResources.name)),
  ]);
  const assignments = resources.length ? await db.select().from(bookingServiceResources)
    .where(inArray(bookingServiceResources.resourceId, resources.map(({ id }) => id))) : [];
  res.json({ blocks, resources: resources.map((resource) => ({
    ...resource, serviceIds: assignments.filter(({ resourceId }) => resourceId === resource.id).map(({ serviceId }) => serviceId),
  })) });
});

bookingRouter.post(`${settings}/blocks`, async (req, res) => {
  const data = input(z.strictObject({
    employeeId: z.uuid().optional(), startsAt: instant, endsAt: instant, reason: z.string().trim().min(1).max(160),
  }), req.body);
  const locationId = uuid(req.params.locationId);
  if (+data.startsAt >= +data.endsAt) throw new HttpError(400, "Ungültiger Sperrzeitraum.");
  const block = await db.transaction(async (tx) => {
    const [location] = await tx.select({ id: locations.id }).from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.organizationId, tenantId(req)))).for("update");
    if (!location) throw new HttpError(404, "Standort nicht gefunden.");
    if (data.employeeId) {
      const [employee] = await tx.select({ id: employees.id }).from(employees)
        .where(and(eq(employees.id, data.employeeId), eq(employees.locationId, locationId), eq(employees.organizationId, tenantId(req))));
      if (!employee) throw new HttpError(404, "Teammitglied nicht gefunden.");
    }
    const [busy] = await tx.select({ id: reservations.id }).from(bookingStaffReservations)
      .innerJoin(reservations, eq(reservations.id, bookingStaffReservations.bookingId)).where(and(
        eq(reservations.locationId, locationId),
        lt(bookingStaffReservations.startsAt, data.endsAt), gt(bookingStaffReservations.endsAt, data.startsAt),
        data.employeeId ? eq(bookingStaffReservations.employeeId, data.employeeId) : undefined,
      )).limit(1);
    if (busy) throw new HttpError(409, "Im Sperrzeitraum besteht bereits ein Termin.");
    const [created] = await tx.insert(bookingBlocks).values({ ...data, locationId }).returning();
    return created;
  });
  res.status(201).json(block);
});

bookingRouter.delete(`${settings}/blocks/:id`, async (req, res) => {
  const locationId = uuid(req.params.locationId);
  const [deleted] = await db.delete(bookingBlocks).where(and(eq(bookingBlocks.id, uuid(req.params.id)),
    eq(bookingBlocks.locationId, locationId), eq(bookingBlocks.locationId, db.select({ id: locations.id }).from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.organizationId, tenantId(req))))))).returning({ id: bookingBlocks.id });
  if (!deleted) throw new HttpError(404, "Sperrzeit nicht gefunden.");
  res.status(204).end();
});

bookingRouter.post(`${settings}/resources`, async (req, res) => {
  const { name, serviceIds } = input(z.strictObject({ name: z.string().trim().min(1).max(100), serviceIds: z.array(z.uuid()).min(1).max(100) }), req.body);
  const locationId = uuid(req.params.locationId);
  const ids = [...new Set(serviceIds)];
  const resource = await db.transaction(async (tx) => {
    const [location] = await tx.select({ id: locations.id }).from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.organizationId, tenantId(req)))).for("update");
    if (!location) throw new HttpError(404, "Standort nicht gefunden.");
    const owned = await tx.select({ id: services.id }).from(services).where(and(eq(services.locationId, locationId), inArray(services.id, ids)));
    if (owned.length !== ids.length) throw new HttpError(404, "Leistung nicht gefunden.");
    const active = await tx.select({ items: reservations.items }).from(reservations).where(and(
      eq(reservations.locationId, locationId), eq(reservations.status, "confirmed"), gt(reservations.endsAt, new Date()),
    ));
    if (active.some(({ items }) => items.some(({ serviceId }) => ids.includes(serviceId)))) {
      throw new HttpError(409, "Für mindestens eine dieser Leistungen bestehen bereits Termine.");
    }
    const [created] = await tx.insert(bookingResources).values({ name, locationId }).returning();
    await tx.insert(bookingServiceResources).values(ids.map((serviceId) => ({ resourceId: created!.id, serviceId })));
    return created;
  });
  res.status(201).json(resource);
});

bookingRouter.delete(`${settings}/resources/:id`, async (req, res) => {
  const id = uuid(req.params.id);
  const locationId = uuid(req.params.locationId);
  await db.transaction(async (tx) => {
    const [location] = await tx.select({ id: locations.id }).from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.organizationId, tenantId(req)))).for("update");
    if (!location) throw new HttpError(404, "Standort nicht gefunden.");
    const [used] = await tx.select({ id: bookingResourceReservations.bookingId }).from(bookingResourceReservations)
      .where(eq(bookingResourceReservations.resourceId, id)).limit(1);
    const [resource] = await tx.select({ id: bookingResources.id }).from(bookingResources)
      .where(and(eq(bookingResources.id, id), eq(bookingResources.locationId, locationId)));
    if (!resource) throw new HttpError(404, "Ressource nicht gefunden.");
    if (used) throw new HttpError(409, "Ressource ist für bestehende Termine reserviert.");
    await tx.delete(bookingResources).where(eq(bookingResources.id, id));
  });
  res.status(204).end();
});
