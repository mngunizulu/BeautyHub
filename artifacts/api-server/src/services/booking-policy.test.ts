import { expect, it } from "vitest";
import { estimatedFeeCents, isLateCancellation } from "./booking-policy";

it("applies integer-cent fee rules", () => {
  expect(estimatedFeeCents(101, { kind: "percentage", value: 50 })).toBe(51);
  expect(estimatedFeeCents(10000, { kind: "fixed", value: 1700 })).toBe(1700);
});

it("treats the exact notice cutoff as on time", () => {
  const starts = new Date("2026-11-25T10:00:00Z");
  expect(isLateCancellation(starts, new Date("2026-11-24T10:00:00Z"), 24)).toBe(false);
  expect(isLateCancellation(starts, new Date("2026-11-24T10:00:00.001Z"), 24)).toBe(true);
});
