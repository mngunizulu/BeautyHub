import { publicLocation } from "../services/marketplace-visibility";
import { raw, Router, type IRouter, type Response } from "express";
import { and, asc, count, eq } from "drizzle-orm";
import { db, galleryPhotos, locations } from "@workspace/db";
import { allowRoles, requireAuthentication, requireOrganization } from "../middlewares/authentication";
import { HttpError } from "../lib/http-error";
import { tenantId, uuid } from "../lib/input";

const maxPhotos = 12;
const maxBytes = 768 * 1024;
const photoFields = { id: galleryPhotos.id, alt: galleryPhotos.alt };
const imageFields = { mime: galleryPhotos.mime, content: galleryPhotos.content };

function imageType(data: Buffer) {
  if (data.length >= 45 && data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
    && data.toString("ascii", 12, 16) === "IHDR" && data.toString("ascii", data.length - 8, data.length - 4) === "IEND") return "image/png";
  if (data.length >= 16 && data.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))
    && data.readUInt16BE(data.length - 2) === 0xffd9) return "image/jpeg";
  if (data.length >= 20 && data.toString("ascii", 0, 4) === "RIFF" && data.readUInt32LE(4) === data.length - 8
    && data.toString("ascii", 8, 12) === "WEBP" && ["VP8 ", "VP8L", "VP8X"].includes(data.toString("ascii", 12, 16))) return "image/webp";
  return undefined;
}

function sendImage(res: Response, image: { mime: string; content: Buffer } | undefined) {
  if (!image) throw new HttpError(404, "Foto nicht gefunden.");
  res.set("Cache-Control", "no-store").type(image.mime).send(image.content);
}

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

galleryRouter.post(managementPath, raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: maxBytes, inflate: false }), async (req, res) => {
  const locationId = uuid(req.params.locationId);
  const alt = typeof req.query.alt === "string" ? req.query.alt.trim() : "";
  if (!alt || alt.length > 160) throw new HttpError(400, "Bitte beschreibe das Foto in höchstens 160 Zeichen.");
  const mime = Buffer.isBuffer(req.body) ? imageType(req.body) : undefined;
  if (!mime || !req.is(mime)) throw new HttpError(400, "Bitte lade ein gültiges JPEG-, PNG- oder WebP-Bild hoch.");

  const photo = await db.transaction(async (tx) => {
    const [location] = await tx.select({ id: locations.id }).from(locations)
      .where(ownedLocation(locationId, tenantId(req))).for("update");
    if (!location) throw new HttpError(404, "Standort nicht gefunden.");
    const [total] = await tx.select({ value: count() }).from(galleryPhotos).where(eq(galleryPhotos.locationId, locationId));
    if (total && total.value >= maxPhotos) throw new HttpError(409, "Pro Standort sind höchstens 12 Fotos möglich.");
    const [created] = await tx.insert(galleryPhotos).values({ locationId, alt, mime, content: req.body }).returning(photoFields);
    return created;
  });
  res.status(201).json(photo);
});

galleryRouter.get(`${managementPath}/:photoId`, async (req, res) => {
  const [image] = await db.select(imageFields).from(galleryPhotos)
    .innerJoin(locations, eq(locations.id, galleryPhotos.locationId))
    .where(and(eq(galleryPhotos.id, uuid(req.params.photoId)), ownedLocation(uuid(req.params.locationId), tenantId(req))));
  sendImage(res, image);
});

galleryRouter.delete(`${managementPath}/:photoId`, async (req, res) => {
  const locationId = uuid(req.params.locationId);
  const [removed] = await db.delete(galleryPhotos)
    .where(and(eq(galleryPhotos.id, uuid(req.params.photoId)), eq(galleryPhotos.locationId, locationId),
      eq(galleryPhotos.locationId, db.select({ id: locations.id }).from(locations).where(ownedLocation(locationId, tenantId(req))))))
    .returning({ id: galleryPhotos.id });
  if (!removed) throw new HttpError(404, "Foto nicht gefunden.");
  res.status(204).end();
});
