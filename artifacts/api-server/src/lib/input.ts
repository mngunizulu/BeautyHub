import { z } from "zod/v4";
import { HttpError } from "./http-error";
import type { Request } from "express";

export function input<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const message = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ").slice(0, 500);
    throw new HttpError(400, `Bitte Eingaben prüfen. ${message}`, "INVALID_INPUT");
  }
  return result.data;
}
export const uuid = (value: unknown) => input(z.uuid(), value);
export const tenantId = (req: Request) => uuid(req.params.organizationId);
export function emailOrEmpty(value: string): void {
  if (value && !z.email().safeParse(value).success) throw new HttpError(400, "Bitte eine gültige E-Mail-Adresse eingeben.");
}
export function validHours(hours: { weekday: number; opens: string; closes: string }[]): void {
  if (new Set(hours.map((h) => h.weekday)).size !== hours.length || hours.some((h) => h.opens >= h.closes)) {
    throw new HttpError(400, "Öffnungs-/Arbeitszeiten dürfen sich nicht überschneiden und müssen vor Schließzeiten liegen.");
  }
}
