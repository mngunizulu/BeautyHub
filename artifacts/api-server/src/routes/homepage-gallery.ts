import { raw, Router, type IRouter } from "express";
import { and, asc, count, eq, exists, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { categories, db, homepagePhotoPlacements, homepagePhotos } from "@workspace/db";
import { galleryImageBytes, galleryImageTypes, sendImage, validateGalleryImage } from "../lib/gallery-image";
import { HttpError } from "../lib/http-error";
import { input, uuid } from "../lib/input";

// The foundation router enforces platform administrator access on /admin.
export const homepageGalleryRouter: IRouter = Router();
const adminPath = "/admin/homepage-gallery";
const publicPath = "/marketplace/homepage-images";
const metadata = { id: homepagePhotos.id, alt: homepagePhotos.alt };
const image = { mime: homepagePhotos.mime, content: homepagePhotos.content };
const placements = () => db.select({ target: homepagePhotoPlacements.target, id: homepagePhotos.id, alt: homepagePhotos.alt })
  .from(homepagePhotoPlacements).innerJoin(homepagePhotos, eq(homepagePhotos.id, homepagePhotoPlacements.photoId));

homepageGalleryRouter.get(publicPath, async (_req, res) => {
  res.set("Cache-Control", "no-store").json(await placements());
});
homepageGalleryRouter.get(publicPath + "/:id", async (req, res) => {
  const [photo] = await db.select(image).from(homepagePhotos).where(and(eq(homepagePhotos.id, uuid(req.params.id)),
    exists(db.select({ id: homepagePhotoPlacements.photoId }).from(homepagePhotoPlacements)
      .where(eq(homepagePhotoPlacements.photoId, homepagePhotos.id)))));
  sendImage(res, photo);
});

homepageGalleryRouter.get(adminPath, async (_req, res) => {
  const [photos, assigned] = await Promise.all([
    db.select(metadata).from(homepagePhotos).orderBy(asc(homepagePhotos.createdAt), asc(homepagePhotos.id)),
    placements(),
  ]);
  res.json({ photos, placements: assigned });
});

homepageGalleryRouter.post(adminPath, raw({ type: galleryImageTypes, limit: galleryImageBytes, inflate: false }), async (req, res) => {
  const alt = input(z.string().trim().min(1).max(160), req.query.alt);
  const mime = validateGalleryImage(req.body, req.is(galleryImageTypes) || undefined);
  const photo = await db.transaction(async (tx) => {
    await tx.execute(sql`lock table homepage_photos in share row exclusive mode`);
    const [current] = await tx.select({ total: count() }).from(homepagePhotos);
    if (current!.total >= 24) throw new HttpError(409, "Die Startseitengalerie enthält bereits 24 Fotos.");
    const [created] = await tx.insert(homepagePhotos).values({ alt, mime, content: req.body }).returning(metadata);
    return created;
  });
  res.status(201).json(photo);
});

homepageGalleryRouter.put(adminPath + "/placements/:target", async (req, res) => {
  const target = input(z.string().regex(/^(hero|category:[a-z0-9-]{1,100})$/), req.params.target);
  const { photoId } = input(z.strictObject({ photoId: z.uuid().nullable() }), req.body);
  await db.transaction(async (tx) => {
    if (target.startsWith("category:")) {
      const [category] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.slug, target.slice(9)));
      if (!category) throw new HttpError(404, "Kategorie nicht gefunden.");
    }
    if (!photoId) {
      await tx.delete(homepagePhotoPlacements).where(eq(homepagePhotoPlacements.target, target));
      return;
    }
    const [photo] = await tx.select(metadata).from(homepagePhotos).where(eq(homepagePhotos.id, photoId)).for("key share");
    if (!photo) throw new HttpError(404, "Foto nicht gefunden.");
    await tx.insert(homepagePhotoPlacements).values({ target, photoId })
      .onConflictDoUpdate({ target: homepagePhotoPlacements.target, set: { photoId } });
  });
  res.status(204).end();
});
homepageGalleryRouter.get(adminPath + "/:id", async (req, res) => {
  const [photo] = await db.select(image).from(homepagePhotos).where(eq(homepagePhotos.id, uuid(req.params.id)));
  sendImage(res, photo);
});
homepageGalleryRouter.delete(adminPath + "/:id", async (req, res) => {
  const [photo] = await db.delete(homepagePhotos).where(eq(homepagePhotos.id, uuid(req.params.id))).returning(metadata);
  if (!photo) throw new HttpError(404, "Foto nicht gefunden.");
  res.status(204).end();
});
