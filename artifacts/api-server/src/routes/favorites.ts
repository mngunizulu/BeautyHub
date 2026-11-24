import { publicLocation } from "../services/marketplace-visibility";
import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, favorites, locations } from "@workspace/db";
import { requireAuthentication } from "../middlewares/authentication";
import { uuid } from "../lib/input";
import { HttpError } from "../lib/http-error";

export const favoritesRouter: IRouter = Router();
favoritesRouter.use("/me/favorites", requireAuthentication);

favoritesRouter.get("/me/favorites", async (req, res) => {
  res.json(await db.select({ id: locations.id, slug: locations.slug, name: locations.name, city: locations.city })
    .from(favorites).innerJoin(locations, eq(locations.id, favorites.locationId))
    .where(and(eq(favorites.userId, req.identity!.id), publicLocation))
    .orderBy(desc(favorites.createdAt), desc(favorites.locationId)));
});

favoritesRouter.put("/me/favorites/:locationId", async (req, res) => {
  const locationId = uuid(req.params.locationId);
  await db.transaction(async (tx) => {
    const [location] = await tx.select({ id: locations.id }).from(locations)
      .where(and(eq(locations.id, locationId), publicLocation)).for("share");
    if (!location) throw new HttpError(404, "Studio nicht gefunden.");
    await tx.insert(favorites).values({ userId: req.identity!.id, locationId }).onConflictDoNothing();
  });
  res.status(204).end();
});

favoritesRouter.delete("/me/favorites/:locationId", async (req, res) => {
  await db.delete(favorites).where(and(eq(favorites.userId, req.identity!.id), eq(favorites.locationId, uuid(req.params.locationId))));
  res.status(204).end();
});
