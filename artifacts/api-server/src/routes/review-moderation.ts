import { Router, type IRouter } from "express";
import { and, asc, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { auditEvents, bookingReviewReports, bookingReviews, db, locations, reservations } from "@workspace/db";
import { HttpError } from "../lib/http-error";
import { input, uuid } from "../lib/input";

export const reviewModerationRouter: IRouter = Router();
// The /admin authentication and platform-role middleware runs before this router.
const path = "/admin/review-moderation";
const pending = isNull(bookingReviewReports.resolvedAt);

reviewModerationRouter.get(path, async (req, res) => {
  const { offset } = input(z.strictObject({ offset: z.coerce.number().int().min(0).max(1_000_000).default(0) }), req.query);
  const report = db.select({
    reason: bookingReviewReports.reason, details: bookingReviewReports.details, reportedAt: bookingReviewReports.createdAt,
    pendingCount: sql<number>`(count(*) over ())::int`.as("pending_count"),
  }).from(bookingReviewReports).where(and(eq(bookingReviewReports.reviewId, bookingReviews.id), pending))
    .orderBy(desc(bookingReviewReports.createdAt), asc(bookingReviewReports.reporterId)).limit(1).as("latest_report");
  const rows = await db.select({
    id: bookingReviews.id, comment: bookingReviews.comment, reply: bookingReviews.reply, rating: bookingReviews.rating,
    hidden: bookingReviews.hiddenByModerator, location: locations.name,
    report: { reason: report.reason, details: report.details, reportedAt: report.reportedAt, pendingCount: report.pendingCount },
  }).from(bookingReviews)
    .innerJoin(reservations, eq(reservations.id, bookingReviews.bookingId))
    .innerJoin(locations, eq(locations.id, reservations.locationId))
    .leftJoinLateral(report, sql`true`)
    .where(and(eq(reservations.status, "completed"), lte(bookingReviews.published, sql`now()`),
      or(eq(bookingReviews.hiddenByModerator, true), sql`${report.reportedAt} is not null`)))
    .orderBy(sql`${report.reportedAt} desc nulls last`, desc(bookingReviews.createdAt), asc(bookingReviews.id))
    .limit(21).offset(offset);
  res.json({ reviews: rows.slice(0, 20), hasMore: rows.length > 20 });
});

reviewModerationRouter.put(path + "/:id", async (req, res) => {
  const id = uuid(req.params.id);
  const { action } = input(z.strictObject({ action: z.enum(["dismiss", "hide", "restore"]) }), req.body);
  await db.transaction(async (tx) => {
    const [review] = await tx.select({ hidden: bookingReviews.hiddenByModerator, organizationId: locations.organizationId })
      .from(bookingReviews).innerJoin(reservations, eq(reservations.id, bookingReviews.bookingId))
      .innerJoin(locations, eq(locations.id, reservations.locationId))
      .where(and(eq(bookingReviews.id, id), eq(reservations.status, "completed"), lte(bookingReviews.published, sql`now()`)))
      .for("update", { of: bookingReviews });
    if (!review) throw new HttpError(404, "Bewertung nicht gefunden.");
    const hidden = action === "dismiss" ? review.hidden : action === "hide";
    if (action === "restore" && !review.hidden) return;
    if (action !== "restore" && !review.hidden) {
      const [report] = await tx.select({ reviewId: bookingReviewReports.reviewId }).from(bookingReviewReports)
        .where(and(eq(bookingReviewReports.reviewId, id), pending)).limit(1);
      if (!report) throw new HttpError(409, "Diese Bewertung hat keine offene Meldung.");
    }
    const resolved = await tx.update(bookingReviewReports).set({ resolvedAt: new Date() })
      .where(and(eq(bookingReviewReports.reviewId, id), pending)).returning({ reviewId: bookingReviewReports.reviewId });
    if (hidden !== review.hidden) {
      await tx.update(bookingReviews).set({ hiddenByModerator: hidden }).where(eq(bookingReviews.id, id));
    }
    if (resolved.length || hidden !== review.hidden) {
      await tx.insert(auditEvents).values({ organizationId: review.organizationId, actorId: req.identity!.id,
        action: "review_moderation_" + action, targetId: id });
    }
  });
  res.status(204).end();
});
