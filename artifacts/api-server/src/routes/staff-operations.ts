import { Router, type IRouter } from "express";
import { and, asc, eq, gt } from "drizzle-orm";
import { z } from "zod/v4";
import { db, employees, locations, bookingStaffReservations, staffBreaks } from "@workspace/db";
import { HttpError } from "../lib/http-error";
import { input, tenantId, uuid } from "../lib/input";
import { allowRoles, requireAuthentication, requireOrganization } from "../middlewares/authentication";
import { dateNumber, localClock, minute } from "../services/booking-time";

export const staffOperationsRouter: IRouter = Router();
const path = "/organizations/:organizationId/staff-breaks/:employeeId" as const;
staffOperationsRouter.use(path, requireAuthentication, requireOrganization, allowRoles("owner", "manager"));
const ownership = (employeeId: string, organizationId: string) =>
  and(eq(employees.id, employeeId), eq(employees.organizationId, organizationId));

staffOperationsRouter.get(path, async (req, res) => {
  const employeeId = uuid(req.params.employeeId);
  const [employee] = await db.select({ id: employees.id }).from(employees).where(ownership(employeeId, tenantId(req)));
  if (!employee) throw new HttpError(404, "Teammitglied nicht gefunden.");
  res.json(await db.select({ weekday: staffBreaks.weekday, begins: staffBreaks.begins, ends: staffBreaks.ends })
    .from(staffBreaks).where(eq(staffBreaks.employeeId, employeeId)).orderBy(asc(staffBreaks.weekday), asc(staffBreaks.begins)));
});

const time = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
const breaksInput = z.array(z.strictObject({ weekday: z.number().int().min(1).max(7), begins: time, ends: time })).max(28);

staffOperationsRouter.put(path, async (req, res) => {
  const employeeId = uuid(req.params.employeeId);
  const organizationId = tenantId(req);
  const entries = input(breaksInput, req.body).sort((a, b) => a.weekday - b.weekday || a.begins.localeCompare(b.begins));
  if (entries.some((entry, index) => entry.begins >= entry.ends ||
    (index > 0 && entries[index - 1]!.weekday === entry.weekday && entries[index - 1]!.ends > entry.begins))) {
    throw new HttpError(400, "Pausen müssen geordnet sein und dürfen sich nicht überschneiden.");
  }
  await db.transaction(async (tx) => {
    const [reference] = await tx.select({ locationId: employees.locationId }).from(employees).where(ownership(employeeId, organizationId));
    if (!reference) throw new HttpError(404, "Teammitglied nicht gefunden.");
    const [location] = await tx.select().from(locations).where(and(
      eq(locations.id, reference.locationId), eq(locations.organizationId, organizationId),
    )).for("update");
    const [employee] = await tx.select().from(employees).where(ownership(employeeId, organizationId)).for("update");
    if (!employee || !location || employee.locationId !== location.id) throw new HttpError(409, "Standort wurde geändert. Bitte erneut laden.");
    for (const entry of entries) {
      const shift = employee.workingHours.find((item) => item.weekday === entry.weekday);
      if (!shift || entry.begins < shift.opens || entry.ends > shift.closes) {
        const day = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"][entry.weekday - 1];
        throw new HttpError(400, `Die Pause am ${day} muss innerhalb der Arbeitszeit liegen.`);
      }
    }
    if (entries.length) {
      const now = Date.now();
      const appointments = await tx.select({ startsAt: bookingStaffReservations.startsAt, endsAt: bookingStaffReservations.endsAt }).from(bookingStaffReservations)
        .where(and(eq(bookingStaffReservations.employeeId, employeeId), gt(bookingStaffReservations.endsAt, new Date(now))));
      const clock = localClock(location.timezone);
      for (const { startsAt, endsAt } of appointments) {
        for (let instant = Math.max(+startsAt, Math.floor(now / minute) * minute); instant < +endsAt; instant += minute) {
          const local = clock(instant);
          const weekday = new Date(dateNumber(local.date)).getUTCDay() || 7;
          if (entries.some((entry) => entry.weekday === weekday && local.time >= entry.begins && local.time < entry.ends)) {
            throw new HttpError(409, "Eine Pause überschneidet sich mit einem bestätigten Termin.");
          }
        }
      }
    }
    await tx.delete(staffBreaks).where(eq(staffBreaks.employeeId, employeeId));
    if (entries.length) await tx.insert(staffBreaks).values(entries.map((entry) => ({ ...entry, employeeId })));
  });
  res.json(entries);
});
