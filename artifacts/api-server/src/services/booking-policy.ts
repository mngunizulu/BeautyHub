type FeeTerms = { kind: "fixed" | "percentage"; value: number };

export function estimatedFeeCents(priceCents: number, terms: FeeTerms) {
  return terms.kind === "fixed" ? terms.value : Math.round(priceCents * terms.value / 100);
}

export function isLateCancellation(start: Date, cancelled: Date, noticeHours: number) {
  return +start - +cancelled < noticeHours * 3_600_000;
}
