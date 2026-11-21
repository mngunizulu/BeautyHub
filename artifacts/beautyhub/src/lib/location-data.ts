import type { LocationInput } from "@workspace/api-client-react";

/** A partial editor must not overwrite fields owned by another open panel. */
export function mergeLocationPart(
  current: LocationInput, draft: LocationInput, part: "address" | "hours" | "booking" | "all",
): LocationInput {
  if (part === "all") return draft;
  if (part === "hours") return { ...current, openingHours: draft.openingHours };
  if (part === "booking") return {
    ...current, timezone: draft.timezone, leadTimeHours: draft.leadTimeHours,
    advanceBookingDays: draft.advanceBookingDays, contactPreference: draft.contactPreference,
  };
  return {
    ...current, name: draft.name, country: draft.country, postalCode: draft.postalCode,
    city: draft.city, street: draft.street, houseNumber: draft.houseNumber,
    addressExtra: draft.addressExtra, district: draft.district,
    latitude: draft.latitude, longitude: draft.longitude,
  };
}
