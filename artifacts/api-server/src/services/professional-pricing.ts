import type { BookingLine } from "@workspace/db";

export function summarizeQuote(items: BookingLine[]) {
  return {
    items,
    priceCents: items.reduce((sum, line) => sum + line.priceCents, 0),
    durationMinutes: items.reduce((sum, line) => sum + line.durationMinutes, 0),
    occupiedMinutes: items.reduce((sum, line) => sum + line.preparationMinutes + line.durationMinutes + line.cleanupMinutes, 0),
  };
}

export function priceForProfessional(
  items: BookingLine[], professional: { id: string; name: string },
  overrides: { serviceId: string; variantId: string | null; priceCents: number | null; durationMinutes: number | null }[],
) {
  return summarizeQuote(items.map((item) => {
    const override = overrides.find((entry) => entry.serviceId === item.serviceId && entry.variantId === item.variantId);
    return { ...item, employeeId: professional.id, professionalName: professional.name,
      priceCents: override?.priceCents ?? item.priceCents, durationMinutes: override?.durationMinutes ?? item.durationMinutes };
  }));
}
