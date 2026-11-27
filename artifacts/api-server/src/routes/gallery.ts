import { publicLocation } from "../services/marketplace-visibility";
import { z } from "zod/v4";
import { raw, Router, type IRouter } from "express";
import { and, asc, count, eq } from "drizzle-orm";
import { db, galleryPhotos, inventoryProducts, locations, services } from "@workspace/db";
import { allowRoles, requireAuthentication, requireOrganization } from "../middlewares/authentication";
import { galleryImageBytes, galleryImageTypes, sendImage, validateGalleryImage } from "../lib/gallery-image";
import { HttpError } from "../lib/http-error";
import { input, tenantId, uuid } from "../lib/input";

const maxPhotos = 10;
const photoFields = { id: galleryPhotos.id, alt: galleryPhotos.alt };
const imageFields = { mime: galleryPhotos.mime, content: galleryPhotos.content };

export const galleryRouter: IRouter = Router();
galleryRouter.get("/businesses/:slug/gallery", async (req, res) => {
  const rows = await db.select({ photo: photoFields }).from(locations)
    .leftJoin(galleryPhotos, eq(galleryPhotos.locationId, locations.id))
    .where(and(eq(locations.slug, req.params.slug), publicLocation))
    .orderBy(asc(galleryPhotos.createdAt), asc(galleryPhotos.id));
  if (!rows.length) throw new HttpError(404, "Studio nicht gefunden.");
  res.set("Cache-Control", "no-store").json(rows.flatMap(({ photo }) => photo ? [photo] : []));
});

galleryRouter.get("/gallery/:photoId", async (req, res) => {
  const [image] = await db.select(imageFields).from(galleryPhotos)
    .innerJoin(locations, eq(locations.id, galleryPhotos.locationId))
    .where(and(eq(galleryPhotos.id, uuid(req.params.photoId)), publicLocation));
  sendImage(res, image);
});

const managementPath = "/organizations/:organizationId/locations/:locationId/gallery" as const;
galleryRouter.use(managementPath, requireAuthentication, requireOrganization, allowRoles("owner", "manager"));
const ownedLocation = (locationId: string, organizationId: string) =>
  and(eq(locations.id, locationId), eq(locations.organizationId, organizationId));

galleryRouter.get(managementPath, async (req, res) => {
  const locationId = uuid(req.params.locationId);
  const [location] = await db.select({ id: locations.id }).from(locations)
    .where(ownedLocation(locationId, tenantId(req)));
  if (!location) throw new HttpError(404, "Standort nicht gefunden.");
  res.json(await db.select(photoFields).from(galleryPhotos).where(eq(galleryPhotos.locationId, locationId))
    .orderBy(asc(galleryPhotos.createdAt), asc(galleryPhotos.id)));
});

galleryRouter.post(managementPath, raw({ type: galleryImageTypes, limit: galleryImageBytes, inflate: false }), async (req, res) => {
  const locationId = uuid(req.params.locationId);
  const alt = typeof req.query.alt === "string" ? req.query.alt.trim() : "";
  if (!alt || alt.length > 160) throw new HttpError(400, "Bitte beschreibe das Foto in höchstens 160 Zeichen.");
  const mime = validateGalleryImage(req.body, req.is(galleryImageTypes) || undefined);

  const photo = await db.transaction(async (tx) => {
    const [location] = await tx.select({ id: locations.id }).from(locations)
      .where(ownedLocation(locationId, tenantId(req))).for("update");
    if (!location) throw new HttpError(404, "Standort nicht gefunden.");
    const [total] = await tx.select({ value: count() }).from(galleryPhotos).where(eq(galleryPhotos.locationId, locationId));
    if (total && total.value >= maxPhotos) throw new HttpError(409, "Pro Standort sind höchstens 10 Fotos möglich.");
    const [created] = await tx.insert(galleryPhotos).values({ locationId, alt, mime, content: req.body }).returning(photoFields);
    return created;
  });
  res.status(201).json(photo);
});

const assignmentsPath = `${managementPath}/assignments` as const;
const assignmentPhoto = { photoId: z.uuid().nullable() };
const assignmentInput = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("cover"), ...assignmentPhoto }),
  z.strictObject({ kind: z.literal("service"), targetId: z.uuid(), ...assignmentPhoto }),
  z.strictObject({ kind: z.literal("product"), targetId: z.uuid(), ...assignmentPhoto }),
]);

galleryRouter.get(assignmentsPath, async (req, res) => {
  const locationId = uuid(req.params.locationId);
  const [location] = await db.select({ coverPhotoId: locations.coverPhotoId }).from(locations)
    .where(ownedLocation(locationId, tenantId(req)));
  if (!location) throw new HttpError(404, "Standort nicht gefunden.");
  const [offerings, products] = await Promise.all([
    db.select({ id: services.id, name: services.name, photoId: services.photoId }).from(services)
      .where(and(eq(services.locationId, locationId), eq(services.archived, false))).orderBy(asc(services.name)),
    db.select({ id: inventoryProducts.id, name: inventoryProducts.name, sku: inventoryProducts.sku, photoId: inventoryProducts.photoId })
      .from(inventoryProducts).where(and(eq(inventoryProducts.locationId, locationId), eq(inventoryProducts.archived, false)))
      .orderBy(asc(inventoryProducts.name), asc(inventoryProducts.sku)),
  ]);
  res.json({ ...location, services: offerings, products });
});

galleryRouter.put(assignmentsPath, async (req, res) => {
  const locationId = uuid(req.params.locationId);
  const data = input(assignmentInput, req.body);
  await db.transaction(async (tx) => {
    const [location] = await tx.select({ id: locations.id }).from(locations)
      .where(ownedLocation(locationId, tenantId(req))).for("update");
    if (!location) throw new HttpError(404, "Standort nicht gefunden.");
    if (data.photoId) {
      const [photo] = await tx.select({ id: galleryPhotos.id }).from(galleryPhotos)
        .where(and(eq(galleryPhotos.id, data.photoId), eq(galleryPhotos.locationId, locationId))).for("key share");
      if (!photo) throw new HttpError(404, "Foto nicht gefunden.");
    }
    if (data.kind === "cover") {
      await tx.update(locations).set({ coverPhotoId: data.photoId }).where(eq(locations.id, locationId));
      return;
    }
    const table = data.kind === "service" ? services : inventoryProducts;
    const [target] = await tx.update(table).set({ photoId: data.photoId })
      .where(and(eq(table.id, data.targetId), eq(table.locationId, locationId), eq(table.archived, false)))
      .returning({ id: table.id });
    if (!target) throw new HttpError(404, "Leistung oder Artikel nicht gefunden.");
  });
  res.status(204).end();
});

galleryRouter.get(`${managementPath}/:photoId`, async (req, res) => {
  const [image] = await db.select(imageFields).from(galleryPhotos)
    .innerJoin(locations, eq(locations.id, galleryPhotos.locationId))
    .where(and(eq(galleryPhotos.id, uuid(req.params.photoId)), ownedLocation(uuid(req.params.locationId), tenantId(req))));
  sendImage(res, image);
});

galleryRouter.delete(`${managementPath}/:photoId`, async (req, res) => {
  const locationId = uuid(req.params.locationId);
  const photoId = uuid(req.params.photoId);
  await db.transaction(async (tx) => {
    const [location] = await tx.select({ id: locations.id }).from(locations)
      .where(ownedLocation(locationId, tenantId(req))).for("update");
    if (!location) throw new HttpError(404, "Standort nicht gefunden.");
    const [removed] = await tx.delete(galleryPhotos)
      .where(and(eq(galleryPhotos.id, photoId), eq(galleryPhotos.locationId, locationId)))
      .returning({ id: galleryPhotos.id });
    if (!removed) throw new HttpError(404, "Foto nicht gefunden.");
  });
  res.status(204).end();
});
