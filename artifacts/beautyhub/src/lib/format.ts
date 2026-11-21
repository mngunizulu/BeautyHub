import hair from '@/assets/hair.jpg';
import wellness from '@/assets/wellness.jpg';
import nails from '@/assets/nails.jpg';
import hero from '@/assets/hero.jpg';

export const heroImage = hero;
const images: Record<string, string> = { hair, wellness, nails };
export const imageFor = (key: string) => images[key] ?? hero;

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
export const formatCents = (c: number) => eur.format(c / 100);
export const formatDuration = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)} Std.${m % 60 ? ` ${m % 60} Min.` : ''}` : `${m} Min.`;
export const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : new Intl.DateTimeFormat('de-DE', { dateStyle: 'long', timeStyle: 'medium', timeZone: 'Europe/Berlin' }).format(d);
};

const dayNames: Record<string, string> = {
  monday: 'Montag', tuesday: 'Dienstag', wednesday: 'Mittwoch', thursday: 'Donnerstag',
  friday: 'Freitag', saturday: 'Samstag', sunday: 'Sonntag',
  mon: 'Montag', tue: 'Dienstag', wed: 'Mittwoch', thu: 'Donnerstag', fri: 'Freitag', sat: 'Samstag', sun: 'Sonntag',
};
export const dayLabel = (d: string) => dayNames[d.toLowerCase()] ?? d;
