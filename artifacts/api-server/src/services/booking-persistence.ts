import { bookingResourceReservations, reservations } from "@workspace/db";
import { recordBookingEvent } from "./booking-notifications";
import type { BookingTransaction } from "./booking-quote";

export async function persistBooking(tx: BookingTransaction, booking: typeof reservations.$inferInsert, resourceIds: string[]) {
  const [created] = await tx.insert(reservations).values(booking).returning();
  if (!created) throw new Error("Booking insert returned no row");
  if (resourceIds.length) await tx.insert(bookingResourceReservations).values(resourceIds.map((resourceId) => ({
    bookingId: created.id, resourceId, startsAt: created.startsAt, endsAt: created.endsAt,
  })));
  await recordBookingEvent(tx, created, "confirmed");
  return created;
}
