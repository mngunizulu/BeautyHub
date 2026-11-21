import { describe, it, expect } from "vitest";
import type { LocationInput } from "@workspace/api-client-react";
import { mergeLocationPart } from "./location-data";

const old: LocationInput = {
  name: "Test Studio", country: "DE", postalCode: "45127", city: "Essen",
  street: "Teststraße", houseNumber: "12a", addressExtra: "", district: "Mitte",
  timezone: "Europe/Berlin", openingHours: [], leadTimeHours: 2,
  advanceBookingDays: 90, contactPreference: "email",
};
describe("independent onboarding location panels", () => {
  it("keeps newly saved hours when a previously opened booking form is saved", () => {
    const latest = { ...old, openingHours: [{ weekday: 1, opens: "09:00", closes: "18:00" }] };
    const result = mergeLocationPart(latest, { ...old, leadTimeHours: 4 }, "booking");
    expect(result.openingHours).toEqual(latest.openingHours);
    expect(result.leadTimeHours).toBe(4);
  });
  it("keeps booking settings and address when the hours panel submits older hidden values", () => {
    const latest = { ...old, city: "Bonn", leadTimeHours: 6 };
    const draft = { ...old, openingHours: [{ weekday: 2, opens: "10:00", closes: "17:00" }] };
    expect(mergeLocationPart(latest, draft, "hours")).toMatchObject({ city: "Bonn", leadTimeHours: 6, openingHours: draft.openingHours });
  });
  it("keeps saved hours/settings when editing only the address", () => {
    const latest = { ...old, leadTimeHours: 8, openingHours: [{ weekday: 3, opens: "09:00", closes: "16:00" }] };
    expect(mergeLocationPart(latest, { ...old, city: "Bonn" }, "address")).toMatchObject({
      city: "Bonn", leadTimeHours: 8, openingHours: latest.openingHours,
    });
  });
});
