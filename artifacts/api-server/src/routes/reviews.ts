import { publicLocation } from "../services/marketplace-visibility";
import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { bookingReviewReports, bookingReviews, db, locations, reservations } from "@workspace/db";
import { HttpError } from "../lib/http-error";
import { input, tenantId, uuid } from "../lib/input";
import { allowRoles, requireAuthentication, requireOrganization } from "../middlewares/authentication";

export const reviewsRouter: IRouter = Router();
const path = "/organizations/:organizationId/reviews";
const visible = () => and(eq(bookingReviews.hiddenByModerator, false), lte(bookingReviews.published, sql`now()`));
const reviewFields = {
  id: bookingReviews.id, rating: bookingReviews.rating, comment: bookingReviews.comment,
  reply: bookingReviews.reply, date: bookingReviews.createdAt,
};

reviewsRouter.post("/me/reviews/:id/report", requireAuthentication, async (req, res) => {
  const reviewId = uuid(req.params.id);
  const data = input(z.strictObject({
    reason: z.enum(["spam", "abuse", "personal_information", "other"]),
    details: z.string().trim().max(1000).default(""),
  }), req.body);
  const reporterId = req.identity!.id;
  await db.transaction(async (tx) => {
    const [review] = await tx.select({ id: bookingReviews.id }).from(bookingReviews)
      .innerJoin(reservations, eq(reservations.id, bookingReviews.bookingId))
      .innerJoin(locations, eq(locations.id, reservations.locationId))
      .where(and(eq(bookingReviews.id, reviewId), visible(), eq(reservations.status, "completed"),
        publicLocation)).for("update", { of: bookingReviews });
    if (!review) throw new HttpError(404, "Bewertung nicht gefunden.");
    await tx.insert(bookingReviewReports).values({ reviewId, reporterId, ...data }).onConflictDoNothing();
  });
  res.status(204).end();
});

reviewsRouter.use(path, requireAuthentication, requireOrganization, allowRoles("owner", "manager"));

reviewsRouter.get(path, async (req, res) => {
  const { offset } = input(z.strictObject({ offset: z.coerce.number().int().min(0).max(1_000_000).default(0) }), req.query);
  const rows = await db.select({ ...reviewFields, location: locations.name })
    .from(bookingReviews).innerJoin(reservations, eq(reservations.id, bookingReviews.bookingId))
    .innerJoin(locations, eq(locations.id, reservations.locationId))
    .where(and(eq(locations.organizationId, tenantId(req)), eq(reservations.status, "completed"), visible()))
    .orderBy(desc(bookingReviews.createdAt), asc(bookingReviews.id)).limit(21).offset(offset);
  res.json({ reviews: rows.slice(0, 20), hasMore: rows.length > 20 });
});

reviewsRouter.put(path + "/:id/reply", async (req, res) => {
  const id = uuid(req.params.id);
  const { reply } = input(z.strictObject({ reply: z.string().trim().max(2000) }), req.body);
  const completed = db.select({ id: reservations.id }).from(reservations)
    .innerJoin(locations, eq(locations.id, reservations.locationId))
    .where(and(eq(locations.organizationId, tenantId(req)), eq(reservations.status, "completed")));
  const [updated] = await db.update(bookingReviews).set({ reply })
    .where(and(eq(bookingReviews.id, id), visible(), inArray(bookingReviews.bookingId, completed)))
    .returning(reviewFields);
  if (!updated) throw new HttpError(404, "Bewertung nicht gefunden.");
  res.json(updated);
});
