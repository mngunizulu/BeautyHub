import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db, platformSettingChanges, platformSettings } from "@workspace/db";
import { HttpError } from "../lib/http-error";
import { input } from "../lib/input";
import { dateNumber } from "../services/booking-time";
import { platformSettingsFields, platformSettingsId } from "../services/platform-settings";

export const platformOverviewRouter: IRouter = Router();
// Foundation authorization protects the /admin prefix.
const settings = "/admin/platform-settings";
const settingsInput = z.strictObject({ businessRegistrationOpen: z.boolean(), supportIntakeOpen: z.boolean() });

platformOverviewRouter.get(settings, async (_req, res) => {
  const view = await db.transaction(async (tx) => {
    const [current] = await tx.select(platformSettingsFields).from(platformSettings).where(eq(platformSettings.id, platformSettingsId));
    const history = await tx.select({
      id: platformSettingChanges.id, previous: platformSettingChanges.previous,
      current: platformSettingChanges.current, createdAt: platformSettingChanges.createdAt,
    }).from(platformSettingChanges).orderBy(desc(platformSettingChanges.createdAt), desc(platformSettingChanges.id)).limit(20);
    return { current, history };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  res.json(view);
});

platformOverviewRouter.put(settings, async (req, res) => {
  const { expected, next } = input(z.strictObject({ expected: settingsInput, next: settingsInput }), req.body);
  const matches = (left: typeof next, right: typeof next) =>
    left.businessRegistrationOpen === right.businessRegistrationOpen && left.supportIntakeOpen === right.supportIntakeOpen;
  await db.transaction(async (tx) => {
    const [current] = await tx.select(platformSettingsFields).from(platformSettings)
      .where(eq(platformSettings.id, platformSettingsId)).for("update");
    if (!current) throw new Error("Missing platform settings");
    if (matches(current, next)) return;
    if (!matches(current, expected)) throw new HttpError(409, "Die Einstellungen wurden inzwischen geändert.");
    await tx.update(platformSettings).set(next).where(eq(platformSettings.id, platformSettingsId));
    await tx.insert(platformSettingChanges).values({ actorId: req.identity!.id, previous: current, current: next,
      createdAt: sql`clock_timestamp()` });
  });
  res.status(204).end();
});

platformOverviewRouter.get("/admin/platform-analytics", async (req, res) => {
  const { from, to } = input(z.strictObject({ from: z.iso.date(), to: z.iso.date() }), req.query);
  const span = (dateNumber(to) - dateNumber(from)) / 86400000;
  if (!Number.isFinite(span) || span < 0 || span >= 366 || from < "0001-01-01") {
    throw new HttpError(400, "Bitte wähle einen Zeitraum von höchstens 366 Tagen.");
  }
  const report = await db.execute(sql`
    with bounds as (
      select (${from}::date::timestamp at time zone 'Europe/Berlin') as starts,
        ((${to}::date + 1)::timestamp at time zone 'Europe/Berlin') as ends
    ), business as (
      select count(*)::int as total, count(*) filter (where verified_at is not null)::int as verified,
        count(*) filter (where suspended_at is not null)::int as suspended
      from organizations where not is_demo
    ), customers as (
      select count(*)::int as total, count(*) filter (where deletion_requested_at is not null)::int as "deletionRequested"
      from users where not is_platform_admin
    ), visits as (
      select count(*)::int as total, count(*) filter (where b.status = 'completed')::int as completed,
        count(*) filter (where b.status = 'cancelled')::int as cancelled,
        count(*) filter (where b.status = 'no_show')::int as "noShows"
      from bookings b join locations l on l.id=b.location_id
      join organizations o on o.id=l.organization_id cross join bounds
      where not o.is_demo and b.starts_at >= bounds.starts and b.starts_at < bounds.ends
    ), states as (
      select case when s.state = 'cancelled' then 'cancelled'
        when s.period_ends_at <= now() then 'expired' else s.state end as state
      from saas_subscriptions s join organizations o on o.id=s.organization_id where not o.is_demo
    ), subscriptions as (
      select count(*) filter (where state='trial')::int as trial, count(*) filter (where state='active')::int as active,
        count(*) filter (where state='expired')::int as expired, count(*) filter (where state='cancelled')::int as cancelled
      from states
    ), billing as (
      select count(*)::int as activations, coalesce(sum(c.amount_cents), 0) as "simulatedCents"
      from saas_changes c join organizations o on o.id=c.organization_id cross join bounds
      where not o.is_demo and c.action='activate' and c.created_at >= bounds.starts and c.created_at < bounds.ends
    ), support as (
      select count(*) filter (where state='open')::int as open, count(*) filter (where state='resolved')::int as resolved
      from support_cases
    )
    select (select to_jsonb(business) from business) as business, (select to_jsonb(customers) from customers) as customers,
      (select to_jsonb(visits) from visits) as visits, (select to_jsonb(subscriptions) from subscriptions) as subscriptions,
      (select to_jsonb(billing) from billing) as billing, (select to_jsonb(support) from support) as support
  `);
  res.json({ ...report.rows[0], from, to, currency: "EUR", timezone: "Europe/Berlin" });
});
