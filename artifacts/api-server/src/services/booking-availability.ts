import { and, eq, gt, inArray, lt, ne } from "drizzle-orm";
import {
  bookingBlocks, bookingResources, bookingResourceReservations, bookingServiceResources, employees, bookingStaffReservations, type BookingLine,
  employeeServices, locations, organizations, openingHours, staffBreaks, professionalPrices,
} from "@workspace/db";
import { HttpError } from "../lib/http-error";
import { quoteSelection, type BookingSelection, type BookingTransaction } from "./booking-quote";
import { priceForProfessional, summarizeQuote } from "./professional-pricing";
import { dateNumber, localClock, localDayMinutes, minute } from "./booking-time";

export async function bookingLocation(tx: BookingTransaction, slug: string, lock = false) {
  const query = tx.select({ location: locations, suspended: organizations.suspendedAt }).from(locations)
    .innerJoin(organizations, eq(organizations.id, locations.organizationId)).where(eq(locations.slug, slug));
  const [row] = await query;
  if (!row?.location.published || row.suspended) throw new HttpError(404, "Studio nicht gefunden.");
  if (!lock) return row.location;
  const [business] = await tx.select({ suspendedAt: organizations.suspendedAt }).from(organizations)
    .where(eq(organizations.id, row.location.organizationId)).for("share");
  const [current] = await tx.select().from(locations).where(eq(locations.id, row.location.id)).for("update");
  if (!business || business.suspendedAt || !current?.published) throw new HttpError(404, "Studio nicht gefunden.");
  return current;
}

export async function availability(
  tx: BookingTransaction, location: typeof locations.$inferSelect, items: BookingSelection,
  date: string, now: Date, excludeId?: string,
  options?: { internalMode?: "manual" | "walk_in"; firstOnly?: boolean; professionalId?: string; fixedLines?: BookingLine[]; maxPriceCents?: number; dayMinutes?: () => ReturnType<typeof localDayMinutes> },
) {
  const quote = await quoteSelection(tx, location.slug, items, !!options?.internalMode);
  const clock = localClock(location.timezone);
  const requestedDay = dateNumber(date);
  const today = dateNumber(clock(+now).date);
  const weekday = new Date(requestedDay).getUTCDay() || 7;
  const serviceIds = [...new Set(items.map(({ serviceId }) => serviceId))];
  const requiredResources = await tx.select({ id: bookingResources.id }).from(bookingServiceResources)
    .innerJoin(bookingResources, eq(bookingResources.id, bookingServiceResources.resourceId))
    .where(and(eq(bookingResources.locationId, location.id), inArray(bookingServiceResources.serviceId, serviceIds)));
  const resourceIds = [...new Set(requiredResources.map(({ id }) => id))];
  const slots: { employeeId: string; employeeName: string; professionalTitle: string; professionalPhotoUrl: string; startsAt: string; endsAt: string; quote: typeof quote; mixed?: boolean }[] = [];
  const result = { quote, slots, resourceIds };
  if (requestedDay < today || requestedDay > today + location.advanceBookingDays * 1440 * minute) return result;
  const [opening] = await tx.select().from(openingHours)
    .where(and(eq(openingHours.locationId, location.id), eq(openingHours.weekday, weekday)));
  if (!opening) return result;
  const staff = await tx.select().from(employees).where(and(
    eq(employees.organizationId, location.organizationId), eq(employees.locationId, location.id), eq(employees.active, true),
  ));
  if (!staff.length) return result;
  const assignments = await tx.select().from(employeeServices)
    .where(and(inArray(employeeServices.employeeId, staff.map((entry) => entry.id)), inArray(employeeServices.serviceId, serviceIds)));
  const overrides = location.differentialPricing ? await tx.select().from(professionalPrices).where(and(
    inArray(professionalPrices.employeeId, staff.map(({ id }) => id)), inArray(professionalPrices.serviceId, serviceIds),
  )) : [];
  const dayMinutes = options?.dayMinutes?.() ?? localDayMinutes(date, location.timezone);
  if (!dayMinutes.length) return result;
  const rangeStart = new Date(dayMinutes[0]!.instant);
  const rangeEnd = new Date(dayMinutes.at(-1)!.instant + minute);
  const [busy, blocks, occupiedResources, breaks] = await Promise.all([
    tx.select().from(bookingStaffReservations).where(and(
      inArray(bookingStaffReservations.employeeId, staff.map(({ id }) => id)),
      lt(bookingStaffReservations.startsAt, rangeEnd), gt(bookingStaffReservations.endsAt, rangeStart),
      excludeId ? ne(bookingStaffReservations.bookingId, excludeId) : undefined)),
    tx.select().from(bookingBlocks).where(and(eq(bookingBlocks.locationId, location.id),
      lt(bookingBlocks.startsAt, rangeEnd), gt(bookingBlocks.endsAt, rangeStart))),
    resourceIds.length ? tx.select().from(bookingResourceReservations).where(and(
      inArray(bookingResourceReservations.resourceId, resourceIds), lt(bookingResourceReservations.startsAt, rangeEnd),
      gt(bookingResourceReservations.endsAt, rangeStart), excludeId ? ne(bookingResourceReservations.bookingId, excludeId) : undefined,
    )) : [],
    tx.select().from(staffBreaks).where(and(eq(staffBreaks.weekday, weekday), inArray(staffBreaks.employeeId, staff.map(({ id }) => id)))),
  ]);
  const earliest = +now + (options?.internalMode ? 0 : location.leadTimeHours) * 60 * minute;
  const candidates: {
    professional: Pick<(typeof slots)[number], "employeeId" | "employeeName" | "professionalTitle" | "professionalPhotoUrl">;
    lines: BookingLine[];
    eligible: Set<string>;
    canWork: (index: number, length: number) => boolean;
  }[] = [];
  const startingMinute = ({ instant, time }: { instant: number; time: string }) =>
    instant >= earliest && (options?.internalMode === "walk_in" || Number(time.slice(-2)) % 15 === 0);
  for (const employee of staff.sort((a, b) => a.id.localeCompare(b.id))) {
    if (options?.professionalId && options.professionalId !== employee.id) continue;
    const name = options?.internalMode ? employee.displayName : employee.publicName || "Teammitglied";
    const exact = priceForProfessional(quote.items, { id: employee.id, name }, overrides.filter(({ employeeId }) => employee.id === employeeId));
    if (options?.fixedLines) {
      exact.items = exact.items.map((line, index) => ({
        ...options.fixedLines![index]!, employeeId: line.employeeId, professionalName: line.professionalName,
      }));
      Object.assign(exact, summarizeQuote(exact.items));
    }
    const schedule = employee.workingHours.find((entry) => entry.weekday === weekday);
    if (!schedule) continue;
    const eligible = new Set(assignments.filter((entry) => entry.employeeId === employee.id).map((entry) => entry.serviceId));
    if (!eligible.size) continue;
    const blocked = [...occupiedResources, ...blocks.filter((entry) => !entry.employeeId || entry.employeeId === employee.id),
      ...busy.filter((entry) => entry.employeeId === employee.id)];
    const employeeBreaks = breaks.filter((entry) => entry.employeeId === employee.id);
    const open = dayMinutes.map(({ time }) => time >= opening.opens && time < opening.closes &&
      time >= schedule.opens && time < schedule.closes && !employeeBreaks.some((entry) => time >= entry.begins && time < entry.ends));
    // Store the length of the next uninterrupted work interval at each minute.
    const contiguous: number[] = [];
    for (let index = open.length - 1; index >= 0; index--) {
      contiguous[index] = open[index] ? 1 + (contiguous[index + 1] ?? 0) : 0;
    }
    const canWork = (index: number, length: number) => {
      const start = dayMinutes[index]?.instant;
      if (start === undefined || (contiguous[index] ?? 0) < length) return false;
      return !blocked.some(({ startsAt, endsAt }) => start < +endsAt && start + length * minute > +startsAt);
    };
    const professional = { employeeId: employee.id, employeeName: name, professionalTitle: employee.professionalTitle,
      professionalPhotoUrl: employee.publicName ? employee.professionalPhotoUrl : "" };
    candidates.push({ professional, lines: exact.items, eligible, canWork });
    if (eligible.size !== serviceIds.length || exact.occupiedMinutes > 1500 ||
      (options?.maxPriceCents !== undefined && exact.priceCents > options.maxPriceCents)) continue;
    for (const [index, start] of dayMinutes.entries()) {
      if (!startingMinute(start) || !canWork(index, exact.occupiedMinutes)) continue;
      slots.push({ ...professional, startsAt: new Date(start.instant).toISOString(),
        endsAt: new Date(start.instant + exact.occupiedMinutes * minute).toISOString(), quote: exact });
      if (options?.firstOnly) return result;
    }
  }
  if (!options?.professionalId && (location.allowAnyProfessional || options?.internalMode || excludeId) && items.length > 1 &&
    serviceIds.every((id) => candidates.some(({ eligible }) => eligible.has(id)))) {
    const singleStarts = new Set(slots.map((slot) => slot.startsAt));
    for (const [index, start] of dayMinutes.entries()) {
      if (!startingMinute(start)) continue;
      const startsAt = new Date(start.instant).toISOString();
      if (singleStarts.has(startsAt)) continue;
      // A resource remains held across the entire appointment, including staff handoffs.
      const nextResource = occupiedResources.reduce((end, entry) => +entry.endsAt > start.instant
        ? Math.min(end, +entry.startsAt) : end, Infinity);
      const limit = Math.min(1500, (nextResource - start.instant) / minute);
      const memo = new Map<string, BookingLine[] | null>();
      const assign = (position: number, offset: number): BookingLine[] | null => {
        if (position === items.length) return [];
        const key = position + ":" + offset;
        if (memo.has(key)) return memo.get(key)!;
        let best: BookingLine[] | null = null;
        let bestPrice = Infinity;
        for (const candidate of candidates) {
          const line = candidate.lines[position]!;
          const length = line.preparationMinutes + line.durationMinutes + line.cleanupMinutes;
          if (offset + length > limit || !candidate.eligible.has(line.serviceId) || !candidate.canWork(index + offset, length)) continue;
          const remaining = assign(position + 1, offset + length);
          if (!remaining) continue;
          const price = line.priceCents + remaining.reduce((total, entry) => total + entry.priceCents, 0);
          if (price < bestPrice) {
            bestPrice = price;
            best = [line, ...remaining];
          }
        }
        memo.set(key, best);
        return best;
      };
      const lines = assign(0, 0);
      if (!lines) continue;
      const exact = summarizeQuote(lines);
      if (options?.maxPriceCents !== undefined && exact.priceCents > options.maxPriceCents) continue;
      const first = candidates.find(({ professional }) => professional.employeeId === lines[0]!.employeeId)!;
      slots.push({ ...first.professional, mixed: true, startsAt,
        endsAt: new Date(start.instant + exact.occupiedMinutes * minute).toISOString(), quote: exact });
      if (options?.firstOnly) return result;
    }
  }
  slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.employeeId.localeCompare(b.employeeId));
  return result;
}
