import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { input, tenantId } from "../lib/input";
import { HttpError } from "../lib/http-error";
import { allowRoles, requireAuthentication, requireOrganization } from "../middlewares/authentication";
import { capacityCtes } from "../services/report-capacity";
import { dateNumber } from "../services/booking-time";

export const analyticsRouter: IRouter = Router();
const path = "/organizations/:organizationId/analytics";

analyticsRouter.get(path, requireAuthentication, requireOrganization, allowRoles("owner", "manager"), async (req, res) => {
  const organizationId = tenantId(req);
  const { from, to, locationId } = input(z.strictObject({
    from: z.iso.date(), to: z.iso.date(), locationId: z.uuid().optional(),
  }), req.query);
  const days = (dateNumber(to) - dateNumber(from)) / 86400000;
  if (!Number.isFinite(days) || days < 0 || days >= 366 || from < "0001-01-01") {
    throw new HttpError(400, "Bitte wähle einen Zeitraum von höchstens 366 Tagen.");
  }

  const result = await db.execute(sql`
    WITH scope AS (
      SELECT id, name, timezone,
        (${from}::date::timestamp AT TIME ZONE timezone) AS starts,
        ((${to}::date + 1)::timestamp AT TIME ZONE timezone) AS ends
      FROM locations WHERE organization_id = ${organizationId}
      ${locationId ? sql`AND id = ${locationId}` : sql``}
    ), ${capacityCtes}, visits AS (
      SELECT b.id, b.location_id, b.status, b.user_id, b.starts_at, b.employee_id, b.items, b.duration_minutes FROM bookings b
      JOIN scope s ON s.id = b.location_id AND b.starts_at >= s.starts AND b.starts_at < s.ends
    ), booking_totals AS (
      SELECT location_id, count(*)::int AS bookings,
        count(*) FILTER (WHERE status = 'completed')::int AS completed,
        count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
        count(*) FILTER (WHERE status = 'no_show')::int AS "noShows"
      FROM visits GROUP BY location_id
    ), appointment_movements AS (
      SELECT s.id AS location_id, b.id AS booking_id, p.amount_cents AS received, 0 AS refunded
      FROM scope s JOIN bookings b ON b.location_id = s.id
      JOIN appointment_payments p ON p.booking_id = b.id AND p.created_at >= s.starts AND p.created_at < s.ends
      UNION ALL
      SELECT s.id, b.id, 0, r.amount_cents FROM scope s JOIN bookings b ON b.location_id = s.id
      JOIN appointment_payments p ON p.booking_id = b.id
      JOIN appointment_refunds r ON r.payment_id = p.id AND r.created_at >= s.starts AND r.created_at < s.ends
    ), appointment_totals AS (
      SELECT booking_id, sum(received) AS received, sum(refunded) AS refunded FROM appointment_movements GROUP BY booking_id
    ), movements AS (
      SELECT location_id, received, refunded FROM appointment_movements
      UNION ALL
      SELECT s.id, sale.amount_cents, 0 FROM scope s
      JOIN retail_sales sale ON sale.location_id = s.id AND sale.created_at >= s.starts AND sale.created_at < s.ends
      UNION ALL
      SELECT s.id, 0, r.amount_cents FROM scope s JOIN retail_sales sale ON sale.location_id = s.id
      JOIN retail_refunds r ON r.sale_id = sale.id AND r.created_at >= s.starts AND r.created_at < s.ends
    ), cash_totals AS (
      SELECT location_id, sum(received) AS received, sum(refunded) AS refunded FROM movements GROUP BY location_id
    ), inventory AS (
      SELECT p.location_id, count(*) FILTER (WHERE p.stock <= p.reorder_at)::int AS "lowStock",
        sum(p.stock) AS units, sum(p.stock::bigint * p.purchase_cost_cents) AS "inventoryValueCents",
        sum(p.stock) FILTER (WHERE p.purchase_cost_cents IS NULL) AS "unpricedUnits"
      FROM inventory_products p JOIN scope s ON s.id = p.location_id WHERE NOT p.archived GROUP BY p.location_id
    ), breakdown AS (
      SELECT s.id, s.name, coalesce(b.bookings, 0) AS bookings, coalesce(b.completed, 0) AS completed,
        coalesce(b.cancelled, 0) AS cancelled, coalesce(b."noShows", 0) AS "noShows",
        coalesce(c.received, 0) AS "receivedCents", coalesce(c.refunded, 0) AS "refundedCents",
        coalesce(i."lowStock", 0) AS "lowStock", coalesce(i.units, 0) AS units,
        coalesce(i."inventoryValueCents", 0) AS "inventoryValueCents", coalesce(i."unpricedUnits", 0) AS "unpricedUnits",
        coalesce(ct."capacityMinutes", 0) AS "capacityMinutes", coalesce(ct."occupiedMinutes", 0) AS "occupiedMinutes"
      FROM scope s LEFT JOIN booking_totals b ON b.location_id = s.id
      LEFT JOIN cash_totals c ON c.location_id = s.id LEFT JOIN inventory i ON i.location_id = s.id
      LEFT JOIN capacity_totals ct ON ct.location_id = s.id
    ), included AS (
      SELECT id, employee_id, items, duration_minutes FROM visits WHERE status = 'completed'
      UNION
      SELECT b.id, b.employee_id, b.items, b.duration_minutes FROM bookings b JOIN appointment_totals t ON t.booking_id = b.id
    ), lines AS (
      SELECT b.id, coalesce((item.value->>'employeeId')::uuid, b.employee_id) AS employee_id,
        (item.value->>'serviceId')::uuid AS service_id, item.value->>'name' AS name,
        coalesce((item.value->>'durationMinutes')::int, b.duration_minutes) AS minutes,
        coalesce((item.value->>'priceCents')::numeric, 0) AS price, coalesce(item.position, 1) AS position,
        v.status IS NOT DISTINCT FROM 'completed' AS completed,
        coalesce(t.received, 0) AS received, coalesce(t.refunded, 0) AS refunded
      FROM included b LEFT JOIN visits v ON v.id = b.id LEFT JOIN appointment_totals t ON t.booking_id = b.id
      LEFT JOIN LATERAL jsonb_array_elements(b.items) WITH ORDINALITY item(value, position) ON true
    ), weights AS (
      SELECT *, sum(price) OVER (PARTITION BY id) AS total_price,
        sum(price) OVER (PARTITION BY id ORDER BY position) AS running_price
      FROM lines
    ), allocated AS (
      SELECT *,
        CASE WHEN total_price > 0 THEN floor(received * running_price / total_price)
          - floor(received * (running_price - price) / total_price) WHEN position = 1 THEN received ELSE 0 END AS line_received,
        CASE WHEN total_price > 0 THEN floor(refunded * running_price / total_price)
          - floor(refunded * (running_price - price) / total_price) WHEN position = 1 THEN refunded ELSE 0 END AS line_refunded
      FROM weights
    ), team AS (
      SELECT e.id, e.display_name AS name, count(DISTINCT a.id) FILTER (WHERE a.completed)::int AS completed,
        coalesce(sum(a.minutes) FILTER (WHERE a.completed), 0) AS minutes,
        sum(a.line_received) AS "receivedCents", sum(a.line_refunded) AS "refundedCents"
      FROM allocated a JOIN employees e ON e.id = a.employee_id AND e.organization_id = ${organizationId} GROUP BY e.id
    ), service_report AS (
      SELECT coalesce(service_id::text, 'unassigned') AS id, coalesce(min(name), 'Unbekannte Leistung') AS name,
        count(*) FILTER (WHERE completed)::int AS completed,
        sum(line_received) AS "receivedCents", sum(line_refunded) AS "refundedCents"
      FROM allocated GROUP BY service_id
    ), customers AS (
      SELECT count(*) FILTER (WHERE period_visit)::int AS new,
        count(*) FILTER (WHERE NOT period_visit)::int AS repeat
      FROM (
        SELECT selected.user_id, EXISTS (SELECT 1 FROM visits v WHERE v.id = first_visit.id) AS period_visit
        FROM (SELECT DISTINCT user_id FROM visits WHERE status = 'completed' AND user_id IS NOT NULL) selected
        CROSS JOIN LATERAL (
          SELECT b.id FROM bookings b JOIN locations l ON l.id = b.location_id
          WHERE b.user_id = selected.user_id AND b.status = 'completed' AND l.organization_id = ${organizationId}
          ORDER BY b.starts_at, b.id LIMIT 1
        ) first_visit
      ) classification
    ), campaign_capture AS (
      SELECT count(*)::int AS captures, coalesce(sum(c.count), 0) AS recipients
      FROM marketing_captures c JOIN marketing_campaigns m ON m.id = c.campaign_id
      WHERE m.organization_id = ${organizationId}
        AND c.created_at >= (${from}::date::timestamp AT TIME ZONE 'Europe/Berlin')
        AND c.created_at < ((${to}::date + 1)::timestamp AT TIME ZONE 'Europe/Berlin')
    )
    SELECT coalesce((SELECT jsonb_agg(b ORDER BY name, id) FROM breakdown b), '[]') AS locations,
      coalesce((SELECT jsonb_agg(t ORDER BY completed DESC, name, id) FROM team t), '[]') AS staff,
      coalesce((SELECT jsonb_agg(s ORDER BY completed DESC, name, id) FROM service_report s), '[]') AS services,
      (SELECT to_jsonb(c) FROM customers c) AS customers,
      (SELECT to_jsonb(c) FROM campaign_capture c) AS marketing
  `);
  const report = result.rows[0]!;
  if (locationId && Array.isArray(report.locations) && !report.locations.length) throw new HttpError(404, "Standort nicht gefunden.");
  res.json({ ...report, from, to, currency: "EUR" });
});
