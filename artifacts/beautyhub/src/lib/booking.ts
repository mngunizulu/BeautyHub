import { customFetch } from '@workspace/api-client-react';

export interface SelectionItem { serviceId: string; variantId?: string }
export interface QuoteLine {
  name: string; variantName: string | null; employeeId?: string; professionalName?: string; priceCents: number; durationMinutes: number;
}
export interface BookingQuote {
  priceCents: number; durationMinutes: number; occupiedMinutes: number; items: QuoteLine[];
}
export interface Slot {
  employeeId: string; employeeName: string; startsAt: string; endsAt: string;
  professionalTitle?: string; professionalPhotoUrl?: string; mixed?: boolean; quote?: BookingQuote;
}
export interface BookingPolicy {
  version: number; noticeHours: number; rescheduleNoticeHours?: number;
  lateFeeType: 'fixed' | 'percentage'; lateFeeValue: number;
  noShowFeeType: 'fixed' | 'percentage'; noShowFeeValue: number; exceptions: string;
}
export interface Availability {
  quote: BookingQuote;
  professionalChoice?: { individual: boolean; any: boolean };
  slots: Slot[];
  policy: BookingPolicy | null;
}
export interface Booking {
  id: string; locationId: string; employeeId: string; startsAt: string; endsAt: string;
  rescheduleNoticeHours?: number;
  reviewRating?: number | null;
  appointmentNote?: string | null;
  status: 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  items: { name: string; variantName: string | null; serviceId: string; variantId: string | null; employeeId?: string; professionalName?: string }[];
  priceCents: number; salon: string; slug: string; timezone: string; employeeName?: string; customerName?: string; source?: 'online' | 'manual' | 'walk_in';
}
export const myBookingsKey = ['/api/me/bookings'] as const;
export const statusLabel = { confirmed: 'Bestätigt', cancelled: 'Storniert', completed: 'Abgeschlossen', no_show: 'Nicht erschienen' };
export const appointmentLabel = (date: string, zone: string) => new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: zone,
}).format(new Date(date));
export const dateInZone = (zone: string) => new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone,
}).format(new Date());
export const getBookingData = <T>(path: string, signal?: AbortSignal) => customFetch<T>(path, { signal });
export const sendBookingData = <T>(path: string, body?: unknown, method = 'POST') =>
  customFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
