import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

// Explicit fields keep managed-provider identifiers, internal staff IDs and CRM notes out of this download.
export async function accountExportRecords(userId: string) {
  const result = await db.execute(sql`
    WITH own_bookings AS (SELECT * FROM bookings WHERE user_id = ${userId}),
      own_cases AS (SELECT id, subject, state, updated_at FROM support_cases WHERE customer_id = ${userId})
    SELECT
      coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b."startsAt", b.id) FROM (
        SELECT id, location_id AS "locationId", starts_at AS "startsAt", ends_at AS "endsAt",
          created_at AS "createdAt", status, price_cents AS "priceCents", appointment_note AS "appointmentNote",
          (SELECT coalesce(jsonb_agg(jsonb_build_object('serviceId', item->'serviceId', 'name', item->'name',
            'variantName', item->'variantName', 'professionalName', item->'professionalName',
            'durationMinutes', item->'durationMinutes', 'priceCents', item->'priceCents') ORDER BY position), '[]')
            FROM jsonb_array_elements(items) WITH ORDINALITY AS booking_items(item, position)) AS items
        FROM own_bookings
      ) b), '[]') AS bookings,
      coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p."createdAt", p.id) FROM (
        SELECT p.id, p.booking_id AS "bookingId", p.kind, p.method, p.amount_cents AS "amountCents",
          p.discount_cents AS "discountCents", p.created_at AS "createdAt"
        FROM appointment_payments p JOIN own_bookings b ON b.id=p.booking_id
      ) p), '[]') AS payments,
      coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r."createdAt", r.id) FROM (
        SELECT r.id, r.payment_id AS "paymentId", r.amount_cents AS "amountCents", r.created_at AS "createdAt"
        FROM appointment_refunds r JOIN appointment_payments p ON p.id=r.payment_id JOIN own_bookings b ON b.id=p.booking_id
      ) r), '[]') AS refunds,
      coalesce((SELECT jsonb_agg(jsonb_build_object('locationId', location_id, 'createdAt', created_at) ORDER BY created_at, location_id)
        FROM favorites WHERE user_id=${userId}), '[]') AS favorites,
      coalesce((SELECT jsonb_agg(jsonb_build_object('locationId', location_id, 'date', date, 'createdAt', created_at) ORDER BY date, location_id)
        FROM booking_waitlist WHERE user_id=${userId}), '[]') AS "waitlist",
      coalesce((SELECT jsonb_agg(jsonb_build_object('bookingId', r.booking_id, 'rating', r.rating, 'comment', r.comment,
        'createdAt', r.created_at) ORDER BY r.created_at, r.id) FROM booking_reviews r JOIN own_bookings b ON b.id=r.booking_id), '[]') AS reviews,
      coalesce((SELECT jsonb_agg(jsonb_build_object('reviewId', review_id, 'reason', reason, 'details', details,
        'createdAt', created_at, 'resolvedAt', resolved_at) ORDER BY created_at, review_id)
        FROM booking_review_reports WHERE reporter_id=${userId}), '[]') AS "reviewReports",
      coalesce((SELECT jsonb_agg(jsonb_build_object('policyId', policy_id, 'snapshot', snapshot, 'acceptedAt', accepted_at)
        ORDER BY accepted_at, id) FROM policy_acceptances WHERE user_id=${userId}), '[]') AS "policyAcceptances",
      coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'provider', provider, 'status', status) ORDER BY id)
        FROM payment_provider_references WHERE user_id=${userId}), '[]') AS "paymentMethods",
      coalesce((SELECT jsonb_agg(jsonb_build_object('organizationId', organization_id, 'consent', consent, 'updatedAt', updated_at)
        ORDER BY organization_id) FROM business_marketing_preferences WHERE user_id=${userId}), '[]') AS "marketingPreferences",
      coalesce((SELECT jsonb_agg(jsonb_build_object('organizationId', organization_id, 'bookingId', booking_id, 'points', points)
        ORDER BY organization_id, booking_id) FROM loyalty_awards WHERE user_id=${userId}), '[]') AS "loyaltyAwards",
      coalesce((SELECT jsonb_agg(jsonb_build_object('organizationId', r.organization_id, 'points', r.points, 'code', v.code,
        'discountCents', v.discount_cents, 'redeemedAt', v.redeemed_at) ORDER BY r.organization_id, r.voucher_id)
        FROM loyalty_redemptions r JOIN pos_vouchers v ON v.id=r.voucher_id WHERE r.user_id=${userId}), '[]') AS "loyaltyRewards",
      coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'packageId', p.package_id, 'name', s.name, 'kind', s.kind,
        'remaining', p.remaining, 'purchasedAt', p.purchased_at, 'expiresAt', p.expires_at) ORDER BY p.purchased_at, p.id)
        FROM customer_packages p JOIN service_packages s ON s.id=p.package_id WHERE p.user_id=${userId}), '[]') AS packages,
      coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'subject', c.subject, 'state', c.state, 'updatedAt', c.updated_at,
        'messages', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', m.kind, 'body', m.body, 'createdAt', m.created_at)
          ORDER BY m.created_at, m.id) FROM support_messages m WHERE m.case_id=c.id), '[]')) ORDER BY c.updated_at, c.id)
        FROM own_cases c), '[]') AS "supportCases"
  `);
  return result.rows[0]!;
}
