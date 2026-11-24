import { eq } from "drizzle-orm";
import { platformSettings, type PlatformSettings } from "@workspace/db";
import { HttpError } from "../lib/http-error";
import type { BookingTransaction } from "./booking-quote";

export const platformSettingsId = 1;
export const platformSettingsFields = {
  businessRegistrationOpen: platformSettings.businessRegistrationOpen,
  supportIntakeOpen: platformSettings.supportIntakeOpen,
};

export async function requirePlatformIntake(tx: BookingTransaction, key: keyof PlatformSettings) {
  const [settings] = await tx.select(platformSettingsFields).from(platformSettings)
    .where(eq(platformSettings.id, platformSettingsId)).for("share");
  if (!settings) throw new Error("Missing platform settings");
  if (!settings[key]) {
    throw new HttpError(409, key === "businessRegistrationOpen"
      ? "Neue Betriebsregistrierungen sind vorübergehend pausiert."
      : "Neue Supportanfragen sind vorübergehend pausiert.", "PLATFORM_INTAKE_PAUSED");
  }
}
