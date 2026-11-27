import { imageSize } from "image-size";
import type { Response } from "express";
import { HttpError } from "./http-error";

export const galleryImageTypes = ["image/jpeg", "image/png", "image/webp"];
export const galleryImageBytes = 3 * 1024 * 1024;

function imageType(data: Buffer) {
  if (data.length >= 45 && data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
    && data.toString("ascii", 12, 16) === "IHDR" && data.toString("ascii", data.length - 8, data.length - 4) === "IEND") return "image/png";
  if (data.length >= 16 && data.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))
    && data.readUInt16BE(data.length - 2) === 0xffd9) return "image/jpeg";
  if (data.length >= 20 && data.toString("ascii", 0, 4) === "RIFF" && data.readUInt32LE(4) === data.length - 8
    && data.toString("ascii", 8, 12) === "WEBP" && ["VP8 ", "VP8L", "VP8X"].includes(data.toString("ascii", 12, 16))) return "image/webp";
  return undefined;
}

export function sendImage(res: Response, image: { mime: string; content: Buffer } | undefined) {
  if (!image) throw new HttpError(404, "Foto nicht gefunden.");
  res.set("Cache-Control", "no-store").type(image.mime).send(image.content);
}

export function validateGalleryImage(body: unknown, contentType: string | undefined) {
  const mime = Buffer.isBuffer(body) ? imageType(body) : undefined;
  if (!mime || mime !== contentType) throw new HttpError(400, "Bitte lade ein gültiges JPEG-, PNG- oder WebP-Bild hoch.");

  let dimensions: ReturnType<typeof imageSize>;
  try { dimensions = imageSize(body as Buffer); } catch {
    throw new HttpError(400, "Die Bildauflösung konnte nicht gelesen werden.");
  }
  if (dimensions.width < 640 || dimensions.height < 360 || dimensions.width > 3840 || dimensions.height > 3840) {
    throw new HttpError(400, "Fotos müssen mindestens 640 × 360 und höchstens 3840 × 3840 Pixel groß sein.");
  }

  return mime;
}
