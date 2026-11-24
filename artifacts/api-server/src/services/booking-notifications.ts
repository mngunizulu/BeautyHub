import { and, eq, inArray, sql } from "drizzle-orm";
import { bookingEvents, bookingNotifications, businessMarketingPreferences, locations, organizations, users, type reservations } from "@workspace/db";
import type { BookingTransaction } from "./booking-quote";
import { bookingCalendarFile } from "./booking-calendar-file";
import { estimatedFeeCents } from "./booking-policy";

type Booking = typeof reservations.$inferSelect;
type EventKind = typeof bookingEvents.$inferSelect.kind;

const titles = {
  confirmed: "Termin bestätigt",
  rescheduled: "Termin umgebucht",
  cancelled: "Termin storniert",
  reminder: "Terminerinnerung",
};

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const euro = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);

export async function recordBookingEvent(tx: BookingTransaction, booking: Booking, kind: Exclude<EventKind, "reminder" | "follow_up">, estimatedFeeCentsValue?: number | null) {
  if (kind !== "confirmed") {
    const reminders = tx.select({ id: bookingEvents.id }).from(bookingEvents)
      .where(and(eq(bookingEvents.bookingId, booking.id), eq(bookingEvents.kind, "reminder")));
    await tx.delete(bookingNotifications).where(and(inArray(bookingNotifications.eventId, reminders),
      eq(bookingNotifications.status, "pending")));
  }
  const [event] = await tx.insert(bookingEvents).values({ bookingId: booking.id, kind,
    estimatedFeeCents: estimatedFeeCentsValue }).returning();
  const origin = process.env.BEAUTYHUB_BOOKING_EMAIL_APP_URL;
  const mode = process.env.BEAUTYHUB_BOOKING_EMAIL_MODE;
  if (!event || !origin || (mode !== "capture" && mode !== "http") || !booking.userId || kind === "no_show") return;
  const [profile] = await tx.select({ email: users.email, name: users.displayName, remindersEnabled: users.emailNotifications, venue: locations, business: organizations })
    .from(users).innerJoin(locations, eq(locations.id, booking.locationId))
    .innerJoin(organizations, eq(organizations.id, locations.organizationId))
    .where(and(eq(users.id, booking.userId), eq(users.emailVerified, true)));
  if (!profile?.email) return;
  const { venue, business } = profile;
  const manage = new URL("konto", origin.endsWith("/") ? origin : origin + "/");
  if (kind === "completed") {
    if (mode !== "capture" || process.env.BEAUTYHUB_BOOKING_EMAIL_FOLLOW_UPS !== "1" || !profile.remindersEnabled) return;
    const [preference] = await tx.select({ consent: businessMarketingPreferences.consent }).from(businessMarketingPreferences)
      .where(and(eq(businessMarketingPreferences.userId, booking.userId), eq(businessMarketingPreferences.organizationId, business.id)));
    if (!preference?.consent) return;
    const [followUp] = await tx.insert(bookingEvents).values({ bookingId: booking.id, kind: "follow_up" })
      .returning({ id: bookingEvents.id });
    const preferenceLink = new URL(manage);
    preferenceLink.searchParams.set("business-marketing", business.id);
    const subject = "Danke für deinen Besuch bei " + venue.name;
    await tx.insert(bookingNotifications).values({ eventId: followUp!.id,
      availableAt: new Date(Date.now() + 86400000),
      payload: { to: profile.email, subject, calendar: "",
        text: subject + "\n\nTermin bewerten: " + manage.href + "\n\nWerbe-E-Mails abbestellen: " + preferenceLink.href,
        html: `<!doctype html><html lang="de"><meta charset="utf-8"><body><h1>${escapeHtml(subject)}</h1><p><a href="${escapeHtml(manage.href)}">Termin bewerten</a></p><p><a href="${escapeHtml(preferenceLink.href)}">Werbe-E-Mails abbestellen</a></p></body></html>` } });
    return;
  }
  const [revision] = await tx.select({ count: sql<number>`count(*)::int` }).from(bookingEvents)
    .where(and(eq(bookingEvents.bookingId, booking.id), inArray(bookingEvents.kind, ["rescheduled", "cancelled"])));
  const formatter = new Intl.DateTimeFormat("de-DE", { dateStyle: "full", timeStyle: "short", timeZone: venue.timezone });
  const address = [venue.address, venue.addressExtra, [venue.postalCode, venue.city].filter(Boolean).join(" "), venue.country].filter(Boolean).join(", ");
  const services = booking.items.map((line) => [line.name, line.variantName, line.professionalName, line.durationMinutes + " Min.", euro(line.priceCents)]
    .filter(Boolean).join(" · "));
  const policy = booking.policySnapshot;
  const lateFee = euro(estimatedFeeCents(booking.priceCents, { kind: policy.lateFeeType, value: policy.lateFeeValue }));
  const noShowFee = euro(estimatedFeeCents(booking.priceCents, { kind: policy.noShowFeeType, value: policy.noShowFeeValue }));
  const subject = titles[kind] + " · " + venue.name;
  const details = [
    "Hallo " + profile.name + ",",
    "Buchungsnummer " + booking.id,
    formatter.format(booking.startsAt) + " bis " + formatter.format(booking.endsAt) + " (" + venue.timezone + ")",
    ...services,
    "Gesamtbetrag " + euro(booking.priceCents) + ". Simulierte Zahlungsart, keine Abbuchung.",
    "Stornofrist " + policy.noticeHours + " Stunden. Späte Stornierung " + lateFee + ", Nichterscheinen " + noShowFee + ".",
    ...(policy.exceptions ? [policy.exceptions] : []),
    venue.name + " · " + address,
    [business.phone, business.contactEmail].filter(Boolean).join(" · "),
  ].filter(Boolean);
  const logo = /^https:\/\//i.test(business.logoUrl) ? `<img src="${escapeHtml(business.logoUrl)}" width="64" alt="" />` : "";
  const payload = {
    to: profile.email, subject,
    text: ["BeautyHub", subject, ...details, "Termin verwalten: " + manage.href, "Kalenderdatei im Anhang."].join("\n\n"),
    html: `<!doctype html><html lang="de"><meta charset="utf-8"><body style="font-family:system-ui,sans-serif"><main style="max-width:38rem;margin:auto;padding:1rem"><p><strong>BeautyHub</strong></p>${logo}<h1>${escapeHtml(subject)}</h1>${details.map((line) => "<p>" + escapeHtml(line) + "</p>").join("")}<p><a href="${escapeHtml(manage.href)}">Termin verwalten</a></p><p>Kalenderdatei im Anhang.</p></main></body></html>`,
    calendar: bookingCalendarFile({ id: booking.id, salon: venue.name, address, services,
      startsAt: booking.startsAt, endsAt: booking.endsAt, sequence: revision!.count, stamp: event.createdAt, cancelled: kind === "cancelled" }),
  };
  await tx.insert(bookingNotifications).values({ eventId: event.id, payload });
  const reminderAt = new Date(+booking.startsAt - 86400000);
  if (mode === "capture" && process.env.BEAUTYHUB_BOOKING_EMAIL_REMINDERS === "1" &&
      profile.remindersEnabled && kind !== "cancelled" && +reminderAt > Date.now()) {
    const [reminder] = await tx.insert(bookingEvents).values({ bookingId: booking.id, kind: "reminder" }).returning({ id: bookingEvents.id });
    const reminderSubject = titles.reminder + " · " + venue.name;
    await tx.insert(bookingNotifications).values({ eventId: reminder!.id, availableAt: reminderAt,
      payload: { ...payload, subject: reminderSubject,
        text: payload.text.replace(subject, () => reminderSubject), html: payload.html.replace(escapeHtml(subject), () => escapeHtml(reminderSubject)) } });
  }
}
