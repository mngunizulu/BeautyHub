import { expect, it } from "vitest";
import { localDayMinutes } from "./booking-time";

it("omits skipped Berlin wall minutes in spring", () => {
  const minutes = localDayMinutes("2026-03-29", "Europe/Berlin");
  expect(minutes).toHaveLength(23 * 60);
  expect(minutes.some(({ time }) => time === "02:15")).toBe(false);
});

it("preserves both occurrences of folded Berlin wall minutes", () => {
  const minutes = localDayMinutes("2026-10-25", "Europe/Berlin");
  expect(minutes).toHaveLength(25 * 60);
  expect(minutes.filter(({ time }) => time === "02:15").map(({ instant }) => new Date(instant).toISOString()))
    .toEqual(["2026-10-25T00:15:00.000Z", "2026-10-25T01:15:00.000Z"]);
});
