import { sql } from "drizzle-orm";

// Uses the current recurring schedules, not a historical schedule snapshot.
export const capacityCtes = sql`
  capacity_shifts AS (
    SELECT s.id AS location_id, e.id AS employee_id, d.day, s.timezone,
      tstzrange(greatest((d.day::date + h.opens::time) AT TIME ZONE s.timezone,
        (d.day::date + (w.value->>'opens')::time) AT TIME ZONE s.timezone),
        greatest(
          least((d.day::date + h.closes::time) AT TIME ZONE s.timezone,
            (d.day::date + (w.value->>'closes')::time) AT TIME ZONE s.timezone),
          (d.day::date + greatest(h.opens::time, (w.value->>'opens')::time)) AT TIME ZONE s.timezone
        ), '[)') AS shift
    FROM scope s
    CROSS JOIN LATERAL generate_series((s.starts AT TIME ZONE s.timezone)::date::timestamp,
        (s.ends AT TIME ZONE s.timezone)::date::timestamp - interval '1 day', interval '1 day') d(day)
    JOIN opening_hours h ON h.location_id = s.id AND h.weekday = extract(isodow FROM d.day)
    JOIN employees e ON e.location_id = s.id AND e.active
    CROSS JOIN LATERAL jsonb_array_elements(e.working_hours) w(value)
    WHERE (w.value->>'weekday')::int = h.weekday
  ), capacity_free AS (
    SELECT sh.location_id, sh.employee_id, tstzmultirange(sh.shift) - coalesce(unavailable.ranges, '{}'::tstzmultirange) AS free
    FROM capacity_shifts sh LEFT JOIN LATERAL (
      SELECT range_agg(period) AS ranges FROM (
        SELECT tstzrange((sh.day::date + br.begins::time) AT TIME ZONE sh.timezone,
          greatest((sh.day::date + br.ends::time) AT TIME ZONE sh.timezone,
            (sh.day::date + br.begins::time) AT TIME ZONE sh.timezone), '[)') AS period
        FROM staff_breaks br WHERE br.employee_id = sh.employee_id AND br.weekday = extract(isodow FROM sh.day)
        UNION ALL
        SELECT tstzrange(b.starts_at, b.ends_at, '[)') FROM booking_blocks b
        WHERE b.location_id = sh.location_id AND (b.employee_id IS NULL OR b.employee_id = sh.employee_id)
          AND b.starts_at < upper(sh.shift) AND b.ends_at > lower(sh.shift)
      ) exclusions
    ) unavailable ON true
  ), completed_capacity_lines AS (
    SELECT b.id, b.location_id, b.starts_at, b.ends_at, b.employee_id AS primary_employee,
      coalesce((item.value->>'employeeId')::uuid, b.employee_id) AS employee_id,
      coalesce((item.value->>'durationMinutes')::int, 0)
        + coalesce((item.value->>'preparationMinutes')::int, 0)
        + coalesce((item.value->>'cleanupMinutes')::int, 0) AS minutes, item.position
    FROM bookings b JOIN scope s ON s.id = b.location_id
      AND b.starts_at < s.ends AND b.ends_at > s.starts
    LEFT JOIN LATERAL jsonb_array_elements(b.items) WITH ORDINALITY item(value, position) ON true
    WHERE b.status = 'completed'
  ), completed_capacity_segments AS (
    SELECT *, bool_or(employee_id <> primary_employee) OVER (PARTITION BY id) AS split,
      sum(minutes) OVER (PARTITION BY id ORDER BY position) AS elapsed
    FROM completed_capacity_lines
  ), capacity_booked AS (
    SELECT s.id AS location_id, a.employee_id, a.starts_at, a.ends_at
    FROM scope s JOIN booking_staff_reservations a ON a.starts_at < s.ends AND a.ends_at > s.starts
    JOIN bookings b ON b.id = a.booking_id AND b.location_id = s.id AND b.status = 'confirmed'
    UNION ALL
    SELECT location_id, employee_id,
      CASE WHEN split THEN starts_at + (elapsed - minutes) * interval '1 minute' ELSE starts_at END,
      CASE WHEN split THEN least(ends_at, starts_at + elapsed * interval '1 minute') ELSE ends_at END
    FROM completed_capacity_segments WHERE split OR position = 1 OR position IS NULL
  ), capacity_totals AS (
    SELECT f.location_id,
      floor(sum(extract(epoch FROM upper(available.period) - lower(available.period))) / 60)::bigint AS "capacityMinutes",
      floor(sum(coalesce(used.seconds, 0)) / 60)::bigint AS "occupiedMinutes"
    FROM capacity_free f CROSS JOIN LATERAL unnest(f.free) available(period)
    LEFT JOIN LATERAL (
      SELECT sum(extract(epoch FROM upper(segment) - lower(segment))) AS seconds
      FROM unnest((
        SELECT range_agg(tstzrange(b.starts_at, greatest(b.starts_at, b.ends_at), '[)') * available.period)
        FROM capacity_booked b WHERE b.location_id = f.location_id AND b.employee_id = f.employee_id
          AND b.starts_at < upper(available.period) AND b.ends_at > lower(available.period)
      )) segments(segment)
    ) used ON true
    GROUP BY f.location_id
  )
`;
