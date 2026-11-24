import { Router, type IRouter } from "express";
import { and, asc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { customerPackages, db, deletionRequestReviews, erasedTestIdentities, memberships, users } from "@workspace/db";
import { HttpError } from "../lib/http-error";
import { lockProviderIdentity, providerIdentityDigest } from "../services/identity";
import { input, uuid } from "../lib/input";

export const platformCustomersRouter: IRouter = Router();
// Foundation authentication and platform-role middleware protects this prefix.
const path = "/admin/customers";
const erasureEnabled = () => process.env.BEAUTYHUB_TEST_ERASURE === "1" && !!process.env.CLERK_SECRET_KEY?.startsWith("sk_test_");
const isTestAccount = (email: string) => email.endsWith("+clerk_test@example.com");

platformCustomersRouter.get(path, async (req, res) => {
  const { search, scope, offset } = input(z.strictObject({
    search: z.string().trim().max(160).default(""),
    scope: z.enum(["all", "pending", "reviewed"]).default("all"),
    offset: z.coerce.number().int().min(0).max(1000000).default(0),
  }), req.query);
  const rows = await db.select({
    id: users.id, name: users.displayName, email: users.email, emailVerified: users.emailVerified,
    deletionRequestedAt: users.deletionRequestedAt, reviewedAt: deletionRequestReviews.reviewedAt,
    activeOwnerships: db.$count(memberships, and(eq(memberships.userId, users.id),
      eq(memberships.role, "owner"), eq(memberships.status, "active"))),
  }).from(users).leftJoin(deletionRequestReviews, and(eq(deletionRequestReviews.userId, users.id),
    eq(deletionRequestReviews.requestedAt, users.deletionRequestedAt)))
    .where(and(eq(users.isPlatformAdmin, false), search ? or(
      sql`strpos(lower(${users.displayName}), lower(${search})) > 0`,
      sql`strpos(lower(${users.email}), lower(${search})) > 0`,
    ) : undefined,
    scope === "pending" ? and(isNotNull(users.deletionRequestedAt), isNull(deletionRequestReviews.reviewedAt)) : undefined,
    scope === "reviewed" ? isNotNull(deletionRequestReviews.reviewedAt) : undefined))
    .orderBy(scope === "all" ? asc(users.displayName) : asc(users.deletionRequestedAt), asc(users.id))
    .limit(21).offset(offset);
  res.json({ customers: rows.slice(0, 20).map((row) => ({
    ...row, canRehearseErasure: erasureEnabled() && row.emailVerified && isTestAccount(row.email) && !!row.reviewedAt,
  })), hasMore: rows.length > 20 });
});

platformCustomersRouter.get(path + "/:id/deletion-assessment", async (req, res) => {
  const id = uuid(req.params.id);
  const result = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM business_memberships WHERE user_id=u.id AND role='owner' AND status='active') AS "activeOwnerships",
      (SELECT count(*)::int FROM employees WHERE user_id=u.id) AS "staffProfiles",
      (SELECT count(*)::int FROM bookings WHERE user_id=u.id) AS bookings,
      (SELECT count(*)::int FROM bookings WHERE user_id=u.id AND status='confirmed') AS "confirmedBookings",
      (SELECT count(*)::int FROM payment_provider_references WHERE user_id=u.id) AS "paymentReferences",
      (SELECT count(*)::int FROM appointment_payments p JOIN bookings b ON b.id=p.booking_id WHERE b.user_id=u.id) AS "bookingPayments",
      (SELECT count(*)::int FROM customer_packages p WHERE p.user_id=u.id) AS packages,
      (SELECT count(*)::int FROM support_cases WHERE customer_id=u.id) AS "supportCases",
      (SELECT count(*)::int FROM audit_events WHERE actor_id=u.id)
        + (SELECT count(*)::int FROM staff_invitations WHERE created_by=u.id)
        + (SELECT count(*)::int FROM inventory_movements WHERE actor_id=u.id)
        + (SELECT count(*)::int FROM inventory_orders WHERE actor_id=u.id)
        + (SELECT count(*)::int FROM appointment_payments WHERE actor_id=u.id)
        + (SELECT count(*)::int FROM appointment_refunds WHERE actor_id=u.id)
        + (SELECT count(*)::int FROM retail_sales WHERE actor_id=u.id)
        + (SELECT count(*)::int FROM retail_refunds WHERE actor_id=u.id)
        + (SELECT count(*)::int FROM package_uses WHERE actor_id=u.id) AS "businessActions",
      (SELECT count(*)::int FROM policy_acceptances WHERE user_id=u.id) AS "policyAcceptances"
    FROM users u WHERE u.id=${id} AND NOT u.is_platform_admin AND u.deletion_requested_at IS NOT NULL
  `);
  if (!result.rows[0]) throw new HttpError(404, "Keine aktive Löschanfrage gefunden.");
  res.json(result.rows[0]);
});

platformCustomersRouter.put(path + "/:id/deletion-review", async (req, res) => {
  const id = uuid(req.params.id);
  const { requestedAt } = input(z.strictObject({ requestedAt: z.iso.datetime() }), req.body);
  const review = await db.transaction(async (tx) => {
    const [account] = await tx.select({ requestedAt: users.deletionRequestedAt }).from(users)
      .where(and(eq(users.id, id), eq(users.isPlatformAdmin, false))).for("update");
    if (!account) throw new HttpError(404, "Konto nicht gefunden.");
    if (!account.requestedAt || +account.requestedAt !== Date.parse(requestedAt)) {
      throw new HttpError(409, "Die Löschanfrage hat sich geändert.");
    }
    // Select the stored timestamp in SQL to preserve PostgreSQL microseconds.
    const requestTime = sql`(select deletion_requested_at from users where id = ${id})`;
    await tx.insert(deletionRequestReviews).values({ userId: id, requestedAt: requestTime, reviewerId: req.identity!.id })
      .onConflictDoNothing();
    const [row] = await tx.select({ reviewedAt: deletionRequestReviews.reviewedAt }).from(deletionRequestReviews)
      .where(and(eq(deletionRequestReviews.userId, id), eq(deletionRequestReviews.requestedAt, requestTime)));
    return row;
  });
  res.json(review);
});

platformCustomersRouter.post(path + "/:id/test-erasure", async (req, res) => {
  if (!erasureEnabled()) throw new HttpError(404, "Testlöschung ist nicht aktiviert.");
  const id = uuid(req.params.id);
  const { requestedAt } = input(z.strictObject({ requestedAt: z.iso.datetime() }), req.body);
  try {
    await db.transaction(async (tx) => {
      const [candidate] = await tx.select({ providerId: users.externalIdentityId }).from(users).where(eq(users.id, id));
      if (!candidate) throw new HttpError(404, "Konto nicht gefunden.");
      const digest = providerIdentityDigest(candidate.providerId);
      await lockProviderIdentity(tx, digest);
      const [account] = await tx.select().from(users).where(and(eq(users.id, id), eq(users.isPlatformAdmin, false))).for("update");
      if (!account || !account.emailVerified || !isTestAccount(account.email)) {
        throw new HttpError(404, "Kein berechtigtes Testkonto gefunden.");
      }
      if (!account.deletionRequestedAt || +account.deletionRequestedAt !== Date.parse(requestedAt)) {
        throw new HttpError(409, "Die Löschanfrage hat sich geändert.");
      }
      const [reviewed] = await tx.select({ id: deletionRequestReviews.userId }).from(deletionRequestReviews)
        .where(and(eq(deletionRequestReviews.userId, id),
          eq(deletionRequestReviews.requestedAt, sql`(select deletion_requested_at from users where id = ${id})`)));
      if (!reviewed) throw new HttpError(409, "Die Löschanfrage muss zuerst gesichtet werden.");
      const [member] = await tx.select({ id: memberships.id }).from(memberships)
        .where(and(eq(memberships.userId, id), eq(memberships.status, "active"))).limit(1);
      const [packageRecord] = await tx.select({ id: customerPackages.id }).from(customerPackages)
        .where(eq(customerPackages.userId, id)).limit(1);
      if (member || packageRecord) throw new HttpError(409, "Verknüpfte Betriebs- oder Paketdaten erfordern eine Einzelprüfung.");
      await tx.insert(erasedTestIdentities).values({ providerDigest: digest, actorId: req.identity!.id });
      await tx.delete(users).where(eq(users.id, id));
    });
  } catch (error) {
    if (error instanceof Error && error.cause && typeof error.cause === "object" &&
        "code" in error.cause && error.cause.code === "23503") {
      throw new HttpError(409, "Aufbewahrte Datensätze erfordern eine Einzelprüfung.");
    }
    throw error;
  }
  res.status(204).end();
});
