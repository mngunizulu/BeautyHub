import { useQueryClient, type Query } from '@tanstack/react-query';
import type { BusinessWorkspace, HourInput } from '@workspace/api-client-react';
import { getGetOrganizationWorkspaceQueryKey, getListMyOrganizationsQueryKey } from '@workspace/api-client-react';

/** Safe, user-facing error text from an ApiError (data.error / data.message) or generic Error. */
export function errorText(e: unknown, fallback = 'Das hat nicht geklappt. Bitte versuche es erneut.'): string {
  if (!e) return fallback;
  const err = e as { data?: unknown; message?: string; status?: number };
  const d = err.data as { error?: unknown; message?: unknown } | null | undefined;
  if (d && typeof d === 'object') {
    if (typeof d.error === 'string' && d.error) return d.error;
    if (typeof d.message === 'string' && d.message) return d.message;
  }
  if (err.status === 401) return 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.';
  if (err.status === 403) return 'Dafür fehlt dir die Berechtigung in diesem Betrieb.';
  if (err.status === 404) return 'Nicht gefunden oder kein Zugriff.';
  return fallback;
}

export const statusOf = (e: unknown) => (e as { status?: number } | null)?.status;

const publicPrefixes = ['/api/businesses', '/api/marketplace', '/api/categories'];
const isPublic = (q: Query) => typeof q.queryKey[0] === 'string' && publicPrefixes.some((p) => (q.queryKey[0] as string).startsWith(p));

/** Shared cache sync after a workspace mutation that returns the fresh workspace. */
export function useWorkspaceSync(organizationId: string) {
  const qc = useQueryClient();
  return (ws: BusinessWorkspace, publicChange = true) => {
    qc.setQueryData(getGetOrganizationWorkspaceQueryKey(organizationId), ws);
    qc.invalidateQueries({ queryKey: getListMyOrganizationsQueryKey() });
    if (publicChange) qc.invalidateQueries({ predicate: isPublic });
  };
}

export const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

export const euroToCents = (v: string) => {
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
export const centsToEuro = (c: number) => (c / 100).toFixed(2).replace('.', ',');

export function validateHours(h: HourInput[]): string | null {
  for (const r of h) {
    if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(r.opens) || !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(r.closes)) return `${WEEKDAYS[r.weekday - 1]}: Uhrzeit im Format HH:MM angeben.`;
    if (r.opens >= r.closes) return `${WEEKDAYS[r.weekday - 1]}: Schließzeit muss nach der Öffnungszeit liegen.`;
  }
  return null;
}

export const roleLabel: Record<string, string> = { owner: 'Inhaber:in', manager: 'Leitung', employee: 'Mitarbeiter:in' };
export const statusLabel: Record<string, string> = { active: 'aktiv', inactive: 'inaktiv', removed: 'entfernt', pending: 'ausstehend', draft: 'Entwurf', published: 'veröffentlicht' };
