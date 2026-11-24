import { randomUUID } from "node:crypto";
import { link, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, asc, eq, lte } from "drizzle-orm";
import { bookingEvents, bookingNotifications, businessMarketingPreferences, db, locations, reservations, users, type BookingEmail } from "@workspace/db";
import { logger } from "../lib/logger";

export type BookingEmailProvider = (idempotencyKey: string, message: BookingEmail) => Promise<void>;

export function captureBookingEmails(directory: string): BookingEmailProvider {
  return async (key, message) => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, key + "." + randomUUID() + ".tmp");
    try {
      await writeFile(temporary, JSON.stringify(message), { flag: "wx", mode: 0o600 });
      await link(temporary, join(directory, key + ".json"));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    } finally {
      await rm(temporary, { force: true });
    }
  };
}

function httpsUrl(value: string, label: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error(label + " requires HTTPS");
  return url;
}

export function configuredBookingEmailProvider(): BookingEmailProvider | undefined {
  const mode = process.env.BEAUTYHUB_BOOKING_EMAIL_MODE;
  if (!mode || mode === "off") return undefined;
  const appUrl = new URL(process.env.BEAUTYHUB_BOOKING_EMAIL_APP_URL ?? "");
  if (appUrl.username || appUrl.password || appUrl.search || appUrl.hash || !["https:", "http:"].includes(appUrl.protocol)) {
    throw new Error("Invalid booking email app URL");
  }
  if (mode === "capture") {
    const directory = process.env.BEAUTYHUB_BOOKING_EMAIL_CAPTURE_DIR;
    if (!directory) throw new Error("Booking email capture directory is required");
    return captureBookingEmails(directory);
  }
  if (mode !== "http") throw new Error("Unknown booking email mode");
  httpsUrl(appUrl.href, "Booking app URL");
  const endpoint = httpsUrl(process.env.BEAUTYHUB_BOOKING_EMAIL_ENDPOINT ?? "", "Booking email endpoint");
  const token = process.env.BEAUTYHUB_BOOKING_EMAIL_TOKEN;
  if (!token) throw new Error("Booking email endpoint token is required");
  return async (key, message) => {
    const response = await fetch(endpoint, {
      method: "POST",
      body: JSON.stringify(message),
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, "Idempotency-Key": key },
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error("Booking email provider rejected delivery");
  };
}

export async function deliverNextBookingEmail(provider: BookingEmailProvider, now = new Date()) {
  return db.transaction(async (tx) => {
    const [entry] = await tx.select().from(bookingNotifications)
      .where(and(eq(bookingNotifications.status, "pending"), lte(bookingNotifications.availableAt, now)))
      .orderBy(asc(bookingNotifications.availableAt), asc(bookingNotifications.eventId))
      .limit(1).for("update", { skipLocked: true });
    if (!entry) return false;
    const [context] = await tx.select({ kind: bookingEvents.kind, status: reservations.status, startsAt: reservations.startsAt,
      marketingConsent: businessMarketingPreferences.consent, optedIn: users.emailNotifications, email: users.email, verified: users.emailVerified,
      deletionRequestedAt: users.deletionRequestedAt })
      .from(bookingEvents).innerJoin(reservations, eq(reservations.id, bookingEvents.bookingId))
      .innerJoin(locations, eq(locations.id, reservations.locationId))
      .leftJoin(users, eq(users.id, reservations.userId))
      .leftJoin(businessMarketingPreferences, and(eq(businessMarketingPreferences.organizationId, locations.organizationId),
        eq(businessMarketingPreferences.userId, reservations.userId))).where(eq(bookingEvents.id, entry.eventId));
    const optional = context?.kind === "reminder" || context?.kind === "follow_up";
    const eligible = context?.kind === "reminder"
      ? process.env.BEAUTYHUB_BOOKING_EMAIL_REMINDERS === "1" && context.status === "confirmed" && +context.startsAt > +now
      : process.env.BEAUTYHUB_BOOKING_EMAIL_FOLLOW_UPS === "1" && context?.status === "completed" && context.marketingConsent;
    if (optional && (process.env.BEAUTYHUB_BOOKING_EMAIL_MODE !== "capture" || !eligible ||
        !context.optedIn || !context.verified || context.email !== entry.payload.to || context.deletionRequestedAt)) {
      await tx.delete(bookingNotifications).where(eq(bookingNotifications.eventId, entry.eventId));
      return true;
    }
    const attempts = entry.attempts + 1;
    let delivered = false;
    try {
      await provider(entry.eventId, entry.payload);
      delivered = true;
    } catch {
      logger.warn({ eventId: entry.eventId, attempts }, "Booking email delivery failed");
    }
    const status = delivered ? "delivered" : attempts >= 5 ? "failed" : "pending";
    await tx.update(bookingNotifications).set({
      status, attempts, deliveredAt: delivered ? new Date() : null,
      availableAt: delivered ? entry.availableAt : new Date(+now + 60_000 * 2 ** (attempts - 1)),
    }).where(eq(bookingNotifications.eventId, entry.eventId));
    return true;
  });
}

export function startBookingEmailDelivery(provider: BookingEmailProvider) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  let stopped = false;
  const poll = () => {
    running = (async () => {
      try {
        for (let i = 0; i < 10 && !stopped; i++) {
          if (!await deliverNextBookingEmail(provider)) break;
        }
      } catch {
        logger.error("Unable to process booking email queue");
      } finally {
        if (!stopped) timer = setTimeout(poll, 2000);
      }
    })();
  };
  poll();
  return async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    await running;
  };
}
