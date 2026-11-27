import { BusinessCategoryPicker } from '@/components/business-category-picker';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { mergeLocationPart } from '@/lib/location-data';
import { Archive, Check as CheckIcon, Copy, Link2, MapPin, Pencil, Plus, Trash2, UserPlus, X } from 'lucide-react';
import {
  useSaveOrganizationProfile, useCreateBusinessLocation, useSaveBusinessLocation, useCreateEmployee, useSaveEmployee,
  useCreateServiceCategory, useCreateBusinessService, useSaveBusinessService, useArchiveBusinessService, useSaveCancellationPolicy,
  useSetBusinessPublication, useCreateStaffInvitation, useSaveOrganizationMembership,
  getGetOrganizationWorkspaceQueryKey,
  type BusinessWorkspace, type EmployeeInput, type LocationInput, type ManagedEmployee, type ManagedLocation, type ManagedService,
  type OrganizationProfileInput, type PolicyInput, type ServiceInput, type InvitationDelivery, type ManagedMembership,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Check, EmptyNote, Field, FormStatus, HoursEditor, Panel, PrimaryButton, ReadOnlyNote, inputCls } from '@/components/forms';
import { centsToEuro, errorText, euroToCents, roleLabel, statusLabel, useWorkspaceSync, validateHours, WEEKDAYS } from '@/lib/api';
import { formatCents, formatDateTime, formatDuration } from '@/lib/format';

export type Perms = { canEdit: boolean; isOwner: boolean };
type Props = { ws: BusinessWorkspace; perms: Perms };

/* ---------- DTO builders (explicit, never pass output objects back) ---------- */
export const profileDto = (p: OrganizationProfileInput, step?: number): OrganizationProfileInput => ({
  name: p.name, description: p.description, contactEmail: p.contactEmail, phone: p.phone, website: p.website, socialUrl: p.socialUrl ?? "", logoUrl: p.logoUrl ?? "", categoryId: p.categoryId, categoryIds: p.categoryIds,
  onboardingStep: Math.min(6, Math.max(1, step ?? p.onboardingStep)),
});
const locationDto = (l: LocationInput): LocationInput => ({
  name: l.name, country: 'DE', postalCode: l.postalCode, city: l.city, street: l.street, houseNumber: l.houseNumber, addressExtra: l.addressExtra,
  district: l.district, timezone: l.timezone || 'Europe/Berlin', latitude: l.latitude ?? null, longitude: l.longitude ?? null,
  openingHours: l.openingHours.map((h) => ({ weekday: h.weekday, opens: h.opens, closes: h.closes })),
  leadTimeHours: l.leadTimeHours, advanceBookingDays: l.advanceBookingDays, contactPreference: l.contactPreference,
});
const blankLocation = (name: string): LocationInput => ({
  name, country: 'DE', postalCode: '', city: '', street: '', houseNumber: '', addressExtra: '', district: '', timezone: 'Europe/Berlin',
  latitude: null, longitude: null, openingHours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, opens: '09:00', closes: '18:00' })),
  leadTimeHours: 2, advanceBookingDays: 60, contactPreference: 'email',
});
const employeeDto = (e: EmployeeInput): EmployeeInput => ({
  displayName: e.displayName.trim(), email: e.email.trim(), phone: e.phone.trim(), locationId: e.locationId, active: e.active,
  publicName: e.publicName?.trim() ?? '',
  workingHours: e.workingHours.map((h) => ({ weekday: h.weekday, opens: h.opens, closes: h.closes })),
});

const errOf = (e: unknown) => errorText(e);

/* ---------- Profile ---------- */
export function ProfileSection({ ws, perms, nextStep, onSaved, submitLabel = 'Speichern' }: Props & { nextStep?: number; onSaved?: () => void; submitLabel?: string }) {
  const sync = useWorkspaceSync(ws.id);
  const save = useSaveOrganizationProfile();
  const [f, setF] = useState(() => profileDto(ws.profile));
  const [touched, setTouched] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const errors = {
    name: f.name.trim().length < 2 ? 'Mindestens 2 Zeichen.' : null,
    contactEmail: f.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contactEmail) ? 'Keine gültige E-Mail-Adresse.' : null,
    website: f.website && !/^https?:\/\/\S+\.\S+/.test(f.website) ? 'Bitte mit https:// angeben.' : null,
    phone: f.phone && !/^[+0-9 ()/-]{4,30}$/.test(f.phone) ? 'Ungültige Telefonnummer.' : null,
    categoryId: !f.categoryId ? 'Bitte eine Kategorie wählen.' : null,
  };
  const submit = (e: FormEvent) => {
    e.preventDefault(); setTouched(true); setErr(null); setOk(null);
    if (Object.values(errors).some(Boolean)) { setErr('Bitte prüfe die markierten Felder.'); return; }
    const step = nextStep ? Math.max(nextStep, ws.profile.onboardingStep) : ws.profile.onboardingStep;
    save.mutate({ organizationId: ws.id, data: profileDto({ ...f, name: f.name.trim() }, step) }, {
      onSuccess: (w) => { sync(w); setOk('Profil gespeichert.'); onSaved?.(); },
      onError: (e2) => setErr(errOf(e2)),
    });
  };
  const t = (k: keyof typeof errors) => (touched ? errors[k] : null);
  return (
    <Panel title="Betriebsprofil" kicker="Identität">
      {!perms.canEdit && <ReadOnlyNote>Nur Inhaber:innen und Leitungen können das Profil bearbeiten.</ReadOnlyNote>}
      <form onSubmit={submit} noValidate>
        <fieldset disabled={!perms.canEdit} className="grid gap-4 sm:grid-cols-2">
          <Field id="profile-name" label="Name des Betriebs" error={t('name')}><input id="profile-name" value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} data-testid="input-profile-name" /></Field>
          <BusinessCategoryPicker value={f.categoryIds ?? [f.categoryId]}
            onChange={(categoryIds) => setF({ ...f, categoryIds, categoryId: categoryIds[0] ?? '' })}
            error={t('categoryId')} />
          <Field id="profile-description" label="Beschreibung" className="sm:col-span-2" hint={`${f.description.length}/3000 Zeichen`}>
            <textarea id="profile-description" rows={4} maxLength={3000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={inputCls} placeholder="Was macht euren Betrieb aus?" data-testid="input-profile-description" />
          </Field>
          <Field id="profile-email" label="Kontakt-E-Mail" error={t('contactEmail')}><input id="profile-email" type="email" maxLength={200} value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} className={inputCls} data-testid="input-profile-email" /></Field>
          <Field id="profile-phone" label="Telefon" error={t('phone')}><input id="profile-phone" type="tel" maxLength={30} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={inputCls} data-testid="input-profile-phone" /></Field>
          <Field id="profile-website" label="Website (optional)" error={t('website')} className="sm:col-span-2"><input id="profile-website" type="url" maxLength={300} value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} placeholder="https://" className={inputCls} data-testid="input-profile-website" /></Field>
          <Field id="profile-social" label="Social-Media-Profil (optional)">
            <input id="profile-social" type="url" maxLength={500} value={f.socialUrl} onChange={(e) => setF({ ...f, socialUrl: e.target.value })} className={inputCls} />
          </Field>
          <Field id="profile-logo" label="Logo-URL (optional)">
            <input id="profile-logo" type="url" maxLength={500} value={f.logoUrl} onChange={(e) => setF({ ...f, logoUrl: e.target.value })} className={inputCls} />
          </Field>
        </fieldset>
        <div className="mt-5 space-y-3"><FormStatus error={err} success={ok} />
          {perms.canEdit && <PrimaryButton pending={save.isPending} testId="button-save-profile">{submitLabel}</PrimaryButton>}</div>
      </form>
    </Panel>
  );
}

/* ---------- Locations ---------- */
export type LocationPart = 'address' | 'hours' | 'booking' | 'all';

export function LocationPicker({ ws, value, onChange }: { ws: BusinessWorkspace; value: string; onChange: (id: string) => void }) {
  if (ws.locations.length < 2) return null;
  return (
    <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Standort wählen">
      {ws.locations.map((l) => (
        <button key={l.id} type="button" onClick={() => onChange(l.id)} aria-pressed={value === l.id} data-testid={`button-pick-location-${l.id}`}
          className={`rounded-full border px-4 py-1.5 text-sm ${value === l.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-secondary'}`}>{l.name}</button>
      ))}
    </div>
  );
}

export function useLocationChoice(ws: BusinessWorkspace) {
  const [id, setId] = useState(ws.locations[0]?.id ?? '');
  const valid = ws.locations.some((l) => l.id === id) ? id : ws.locations[0]?.id ?? '';
  return [valid, setId] as const;
}

export function LocationEditor({ ws, perms, location, part, onSaved, submitLabel }: Props & { location?: ManagedLocation; part: LocationPart; onSaved?: (w: BusinessWorkspace) => void; submitLabel?: string }) {
  const sync = useWorkspaceSync(ws.id);
  const create = useCreateBusinessLocation();
  const saveLoc = useSaveBusinessLocation();
  const [f, setF] = useState<LocationInput>(() => location ? locationDto(location) : blankLocation(ws.locations.length ? '' : ws.name));
  const [lat, setLat] = useState(location?.latitude != null ? String(location.latitude) : '');
  const [lng, setLng] = useState(location?.longitude != null ? String(location.longitude) : '');
  const [touched, setTouched] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const initFor = useRef(location?.id);
  useEffect(() => {
    if (location && initFor.current !== location.id) {
      initFor.current = location.id;
      setF(locationDto(location)); setLat(location.latitude != null ? String(location.latitude) : ''); setLng(location.longitude != null ? String(location.longitude) : '');
      setOk(null); setErr(null);
    }
  }, [location]);
  const show = (p: LocationPart) => part === 'all' || part === p;
  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
  const latN = num(lat), lngN = num(lng);
  const errors = {
    name: f.name.trim().length < 2 ? 'Mindestens 2 Zeichen.' : null,
    postalCode: !/^([0-9]{5})?$/.test(f.postalCode) ? 'Fünfstellige deutsche Postleitzahl.' : null,
    lat: latN != null && (!Number.isFinite(latN) || latN < -90 || latN > 90) ? 'Breitengrad zwischen -90 und 90.' : null,
    lng: lngN != null && (!Number.isFinite(lngN) || lngN < -180 || lngN > 180) ? 'Längengrad zwischen -180 und 180.' : null,
    hours: validateHours(f.openingHours),
    lead: !Number.isInteger(f.leadTimeHours) || f.leadTimeHours < 0 || f.leadTimeHours > 720 ? '0 bis 720 Stunden.' : null,
    advance: !Number.isInteger(f.advanceBookingDays) || f.advanceBookingDays < 1 || f.advanceBookingDays > 730 ? '1 bis 730 Tage.' : null,
  };
  const pending = create.isPending || saveLoc.isPending;
  const submit = (e: FormEvent) => {
    e.preventDefault(); setTouched(true); setErr(null); setOk(null);
    if (Object.values(errors).some(Boolean)) { setErr('Bitte prüfe die markierten Felder.'); return; }
    const draft = locationDto({ ...f, name: f.name.trim(), city: f.city.trim(), street: f.street.trim(), latitude: latN, longitude: lngN });
    const data = mergeLocationPart(location ? locationDto(location) : draft, draft, part);
    const handlers = { onSuccess: (w: BusinessWorkspace) => { sync(w); setOk(location ? 'Standort gespeichert.' : 'Standort angelegt.'); onSaved?.(w); }, onError: (e2: unknown) => setErr(errOf(e2)) };
    if (location) saveLoc.mutate({ organizationId: ws.id, locationId: location.id, data }, handlers);
    else create.mutate({ organizationId: ws.id, data }, handlers);
  };
  const t = (k: keyof typeof errors) => (touched ? errors[k] : null);
  const id = location?.id ?? 'new';
  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <fieldset disabled={!perms.canEdit} className="space-y-5">
        {show('address') && (
          <div className="grid gap-4 sm:grid-cols-6">
            <Field id={`loc-${id}-name`} label="Name des Standorts" error={t('name')} className="sm:col-span-4"><input id={`loc-${id}-name`} value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} data-testid="input-location-name" /></Field>
            <Field id={`loc-${id}-country`} label="Land" className="sm:col-span-2"><select id={`loc-${id}-country`} value="DE" className={inputCls} disabled data-testid="select-location-country"><option value="DE">Deutschland</option></select></Field>
            <Field id={`loc-${id}-street`} label="Straße" className="sm:col-span-4"><input id={`loc-${id}-street`} value={f.street} maxLength={150} onChange={(e) => setF({ ...f, street: e.target.value })} className={inputCls} data-testid="input-location-street" /></Field>
            <Field id={`loc-${id}-house`} label="Hausnummer" className="sm:col-span-2"><input id={`loc-${id}-house`} value={f.houseNumber} maxLength={20} onChange={(e) => setF({ ...f, houseNumber: e.target.value })} className={inputCls} data-testid="input-location-house-number" /></Field>
            <Field id={`loc-${id}-postal`} label="Postleitzahl" error={t('postalCode')} className="sm:col-span-2"><input id={`loc-${id}-postal`} inputMode="numeric" value={f.postalCode} maxLength={5} onChange={(e) => setF({ ...f, postalCode: e.target.value.replace(/\D/g, '') })} className={inputCls} data-testid="input-location-postal-code" /></Field>
            <Field id={`loc-${id}-city`} label="Stadt" className="sm:col-span-2"><input id={`loc-${id}-city`} value={f.city} maxLength={100} onChange={(e) => setF({ ...f, city: e.target.value })} placeholder="z. B. Essen" className={inputCls} data-testid="input-location-city" /></Field>
            <Field id={`loc-${id}-district`} label="Stadtteil" className="sm:col-span-2"><input id={`loc-${id}-district`} value={f.district} maxLength={100} onChange={(e) => setF({ ...f, district: e.target.value })} className={inputCls} data-testid="input-location-district" /></Field>
            <Field id={`loc-${id}-extra`} label="Adresszusatz (optional)" className="sm:col-span-6"><input id={`loc-${id}-extra`} value={f.addressExtra} maxLength={150} onChange={(e) => setF({ ...f, addressExtra: e.target.value })} placeholder="Hinterhof, 2. OG" className={inputCls} data-testid="input-location-address-extra" /></Field>
            <Field id={`loc-${id}-lat`} label="Breitengrad (optional)" error={t('lat')} className="sm:col-span-3"><input id={`loc-${id}-lat`} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="51.4556" className={inputCls} data-testid="input-location-latitude" /></Field>
            <Field id={`loc-${id}-lng`} label="Längengrad (optional)" error={t('lng')} className="sm:col-span-3"><input id={`loc-${id}-lng`} inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="7.0116" className={inputCls} data-testid="input-location-longitude" /></Field>
            <p className="text-xs text-muted-foreground sm:col-span-6">Entwürfe dürfen unvollständig sein. Für die Veröffentlichung werden Straße, Hausnummer, PLZ und Stadt geprüft.</p>
          </div>
        )}
        {show('hours') && (
          <div>
            <p className="mb-2 text-sm font-medium">Öffnungszeiten</p>
            <HoursEditor idPrefix={`loc-${id}-hours`} value={f.openingHours} onChange={(h) => setF({ ...f, openingHours: h })} disabled={!perms.canEdit} />
            {t('hours') && <p className="mt-1 text-xs text-destructive" role="alert">{t('hours')}</p>}
          </div>
        )}
        {show('booking') && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={`loc-${id}-tz`} label="Zeitzone"><select id={`loc-${id}-tz`} value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} className={inputCls} data-testid="select-location-timezone"><option value="Europe/Berlin">Europe/Berlin</option></select></Field>
            <Field id={`loc-${id}-contact`} label="Bevorzugter Kontaktweg"><select id={`loc-${id}-contact`} value={f.contactPreference} onChange={(e) => setF({ ...f, contactPreference: e.target.value as LocationInput['contactPreference'] })} className={inputCls} data-testid="select-location-contact"><option value="email">E-Mail</option><option value="phone">Telefon</option></select></Field>
            <Field id={`loc-${id}-lead`} label="Mindestvorlauf (Stunden)" error={t('lead')} hint="Wie kurzfristig später gebucht werden darf"><input id={`loc-${id}-lead`} type="number" min={0} max={720} value={f.leadTimeHours} onChange={(e) => setF({ ...f, leadTimeHours: Number(e.target.value) })} className={inputCls} data-testid="input-location-lead-time" /></Field>
            <Field id={`loc-${id}-advance`} label="Buchbar im Voraus (Tage)" error={t('advance')}><input id={`loc-${id}-advance`} type="number" min={1} max={730} value={f.advanceBookingDays} onChange={(e) => setF({ ...f, advanceBookingDays: Number(e.target.value) })} className={inputCls} data-testid="input-location-advance-days" /></Field>
            <p className="text-xs text-muted-foreground sm:col-span-2">Diese Werte bereiten die Terminbuchung vor, die in Stufe 4 aktiviert wird.</p>
          </div>
        )}
      </fieldset>
      <FormStatus error={err} success={ok} />
      {perms.canEdit && <PrimaryButton pending={pending} testId={location ? `button-save-location-${part}` : 'button-create-location'}>{submitLabel ?? (location ? 'Speichern' : 'Standort anlegen')}</PrimaryButton>}
    </form>
  );
}

export function LocationsSection({ ws, perms }: Props) {
  const [adding, setAdding] = useState(false);
  const [sel, setSel] = useLocationChoice(ws);
  const current = ws.locations.find((l) => l.id === sel);
  return (
    <div className="space-y-6">
      <Panel title="Standorte" kicker={`${ws.locations.length} ${ws.locations.length === 1 ? 'Standort' : 'Standorte'}`}
        actions={perms.canEdit && !adding ? <PrimaryButton type="button" variant="ghost" onClick={() => setAdding(true)} testId="button-add-location"><Plus className="h-4 w-4" />Standort hinzufügen</PrimaryButton> : undefined}>
        {ws.locations.length === 0 && !adding ? <EmptyNote title="Noch kein Standort.">Lege die Adresse an, unter der Kund:innen dich finden.</EmptyNote> : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {ws.locations.map((l) => (
              <li key={l.id}>
                <button type="button" onClick={() => setSel(l.id)} className={`w-full rounded-xl border p-4 text-left transition-colors ${sel === l.id ? 'border-primary bg-secondary/60' : 'border-border hover:bg-secondary/40'}`} data-testid={`card-location-${l.id}`}>
                  <span className="flex items-center justify-between gap-2"><span className="font-semibold">{l.name}</span><span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${l.published ? 'bg-primary text-primary-foreground' : 'border border-border'}`}>{l.published ? 'online' : 'Entwurf'}</span></span>
                  <span className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{[l.street && `${l.street} ${l.houseNumber}`, [l.postalCode, l.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || 'Adresse fehlt'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {adding && (
        <Panel title="Neuer Standort" kicker="Adresse" actions={<button type="button" onClick={() => setAdding(false)} className="rounded-full p-2 hover:bg-secondary" aria-label="Schließen" data-testid="button-close-add-location"><X className="h-4 w-4" /></button>}>
          <LocationEditor ws={ws} perms={perms} part="address" onSaved={(w) => { setAdding(false); setSel(w.locations[w.locations.length - 1]?.id ?? ''); }} />
        </Panel>
      )}
      {current && !adding && <Panel title={current.name} kicker="Adresse bearbeiten"><LocationEditor key={current.id} ws={ws} perms={perms} location={current} part="address" /></Panel>}
    </div>
  );
}

export function LocationPartSection({ ws, perms, part, title, kicker }: Props & { part: 'hours' | 'booking'; title: string; kicker: string }) {
  const [sel, setSel] = useLocationChoice(ws);
  const current = ws.locations.find((l) => l.id === sel);
  return (
    <Panel title={title} kicker={kicker}>
      {!perms.canEdit && <ReadOnlyNote>Nur Inhaber:innen und Leitungen können diese Einstellungen ändern.</ReadOnlyNote>}
      {!current ? <EmptyNote title="Zuerst einen Standort anlegen.">Öffnungszeiten und Buchungsregeln gelten pro Standort.</EmptyNote> : (
        <>
          <LocationPicker ws={ws} value={sel} onChange={setSel} />
          <LocationEditor key={`${current.id}-${part}`} ws={ws} perms={perms} location={current} part={part} />
        </>
      )}
    </Panel>
  );
}

/* ---------- Employees ---------- */
function EmployeeForm({ ws, perms, employee, onDone }: Props & { employee?: ManagedEmployee; onDone: () => void }) {
  const sync = useWorkspaceSync(ws.id);
  const create = useCreateEmployee();
  const save = useSaveEmployee();
  const [f, setF] = useState<EmployeeInput>(() => employee ? employeeDto(employee) : { displayName: '', email: '', phone: '', locationId: ws.locations[0]?.id ?? '', active: true, workingHours: [] });
  const [touched, setTouched] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const errors = {
    displayName: f.displayName.trim().length === 0 ? 'Bitte einen Namen angeben.' : null,
    email: f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email) ? 'Keine gültige E-Mail-Adresse.' : null,
    locationId: !f.locationId ? 'Bitte einen Standort wählen.' : null,
    hours: validateHours(f.workingHours),
  };
  const submit = (e: FormEvent) => {
    e.preventDefault(); setTouched(true); setErr(null);
    if (Object.values(errors).some(Boolean)) { setErr('Bitte prüfe die markierten Felder.'); return; }
    const h = { onSuccess: (w: BusinessWorkspace) => { sync(w); onDone(); }, onError: (e2: unknown) => setErr(errOf(e2)) };
    if (employee) save.mutate({ organizationId: ws.id, employeeId: employee.id, data: employeeDto(f) }, h);
    else create.mutate({ organizationId: ws.id, data: employeeDto(f) }, h);
  };
  const id = employee?.id ?? 'new';
  const t = (k: keyof typeof errors) => (touched ? errors[k] : null);
  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-xl border border-border bg-background/60 p-5" data-testid={`form-employee-${id}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`emp-${id}-name`} label="Name" error={t('displayName')}><input id={`emp-${id}-name`} value={f.displayName} maxLength={100} onChange={(e) => setF({ ...f, displayName: e.target.value })} className={inputCls} data-testid="input-employee-name" /></Field>
        <Field id={`emp-${id}-location`} label="Standort" error={t('locationId')}>
          <select id={`emp-${id}-location`} value={f.locationId} onChange={(e) => setF({ ...f, locationId: e.target.value })} className={inputCls} data-testid="select-employee-location">
            <option value="">Bitte wählen</option>{ws.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        <Field id={`emp-${id}-email`} label="E-Mail (optional)" error={t('email')}><input id={`emp-${id}-email`} type="email" maxLength={200} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={inputCls} data-testid="input-employee-email" /></Field>
        <Field id={`emp-${id}-phone`} label="Telefon (optional)"><input id={`emp-${id}-phone`} type="tel" maxLength={30} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={inputCls} data-testid="input-employee-phone" /></Field>
      </div>
      <Field id={`emp-${id}-public-name`} label="Öffentlicher Anzeigename (optional)">
        <input id={`emp-${id}-public-name`} value={f.publicName ?? ''} maxLength={100}
          onChange={(e) => setF({ ...f, publicName: e.target.value })} className={inputCls}
          aria-describedby={`emp-${id}-public-note`} />
        <p id={`emp-${id}-public-note`} className="mt-1 text-sm text-muted-foreground">
          Nur aktive Mitarbeitende mit Anzeigenamen erscheinen im veröffentlichten Salonprofil.
        </p>
      </Field>
      <Check id={`emp-${id}-active`} label="Aktiv" hint="Inaktive Mitarbeitende werden später nicht für Termine eingeplant." checked={f.active} onChange={(v) => setF({ ...f, active: v })} />
      <div>
        <p className="mb-2 text-sm font-medium">Arbeitszeiten (Vorlage)</p>
        <HoursEditor idPrefix={`emp-${id}-hours`} value={f.workingHours} onChange={(h) => setF({ ...f, workingHours: h })} />
        {t('hours') && <p className="mt-1 text-xs text-destructive" role="alert">{t('hours')}</p>}
      </div>
      <FormStatus error={err} />
      <div className="flex gap-2">
        <PrimaryButton pending={create.isPending || save.isPending} disabled={!perms.canEdit} testId="button-save-employee">{employee ? 'Speichern' : 'Mitarbeiter:in anlegen'}</PrimaryButton>
        <PrimaryButton type="button" variant="ghost" onClick={onDone} testId="button-cancel-employee">Abbrechen</PrimaryButton>
      </div>
    </form>
  );
}

export function StaffSection({ ws, perms }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const locName = (id: string) => ws.locations.find((l) => l.id === id)?.name ?? 'ohne Standort';
  const servicesOf = (eid: string) => ws.services.filter((s) => !s.archived && s.employeeIds.includes(eid)).map((s) => s.name);
  return (
    <Panel title="Mitarbeitende" kicker={`${ws.employees.length} Profile`}
      actions={perms.canEdit && editing !== 'new' ? <PrimaryButton type="button" variant="ghost" disabled={!ws.locations.length} onClick={() => setEditing('new')} testId="button-add-employee"><UserPlus className="h-4 w-4" />Mitarbeiter:in hinzufügen</PrimaryButton> : undefined}>
      {!ws.locations.length && perms.canEdit && <ReadOnlyNote>Lege zuerst einen Standort an — Mitarbeitende werden einem Standort zugeordnet.</ReadOnlyNote>}
      {editing === 'new' && <div className="mb-5"><EmployeeForm ws={ws} perms={perms} onDone={() => setEditing(null)} /></div>}
      {ws.employees.length === 0 && editing !== 'new' ? <EmptyNote title="Noch niemand im Team.">Lege Profile für dich und dein Team an, damit Leistungen zugeordnet werden können.</EmptyNote> : (
        <ul className="space-y-3">
          {ws.employees.map((e) => editing === e.id ? <li key={e.id}><EmployeeForm ws={ws} perms={perms} employee={e} onDone={() => setEditing(null)} /></li> : (
            <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border p-4" data-testid={`row-employee-${e.id}`}>
              <div>
                <p className="flex items-center gap-2 font-semibold">{e.displayName}<span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${e.active ? 'bg-secondary' : 'border border-dashed border-border text-muted-foreground'}`}>{e.active ? 'aktiv' : 'inaktiv'}</span>{e.userId && <span className="rounded-full bg-accent/25 px-2 py-0.5 font-mono text-[10px]">mit Konto</span>}</p>
                <p className="mt-1 text-sm text-muted-foreground">{locName(e.locationId)}{e.email && perms.canEdit ? ` · ${e.email}` : ''}</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">{e.workingHours.length ? e.workingHours.map((h) => `${WEEKDAYS[h.weekday - 1].slice(0, 2)} ${h.opens}–${h.closes}`).join(' · ') : 'keine Arbeitszeiten'}</p>
                {servicesOf(e.id).length > 0 && <p className="mt-1 text-xs">Leistungen: {servicesOf(e.id).join(', ')}</p>}
              </div>
              {perms.canEdit && <button type="button" onClick={() => setEditing(e.id)} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm hover:bg-secondary" data-testid={`button-edit-employee-${e.id}`}><Pencil className="h-3.5 w-3.5" />Bearbeiten</button>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ---------- Services ---------- */
type VariantDraft = { id?: string; name: string; price: string; duration: string };
type ServiceDraft = Omit<ServiceInput, 'priceCents' | 'variants'> & { price: string; variants: VariantDraft[] };
const toDraft = (s?: ManagedService, locationId = ''): ServiceDraft => s ? {
  name: s.name, description: s.description, locationId: s.locationId, categoryId: s.categoryId ?? null, price: centsToEuro(s.priceCents), durationMinutes: s.durationMinutes,
  preparationMinutes: s.preparationMinutes, cleanupMinutes: s.cleanupMinutes, published: s.published, onlineBooking: s.onlineBooking, employeeIds: [...s.employeeIds],
  variants: s.variants.map((v) => ({ id: v.id, name: v.name, price: centsToEuro(v.priceCents), duration: String(v.durationMinutes) })),
} : { name: '', description: '', locationId, categoryId: null, price: '', durationMinutes: 30, preparationMinutes: 0, cleanupMinutes: 0, published: true, onlineBooking: false, employeeIds: [], variants: [] };

function ServiceForm({ ws, perms, service, onDone }: Props & { service?: ManagedService; onDone: () => void }) {
  const sync = useWorkspaceSync(ws.id);
  const create = useCreateBusinessService();
  const save = useSaveBusinessService();
  const createCat = useCreateServiceCategory();
  const [f, setF] = useState<ServiceDraft>(() => toDraft(service, ws.locations[0]?.id ?? ''));
  const [newCat, setNewCat] = useState('');
  const [touched, setTouched] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const priceCents = euroToCents(f.price);
  const variantErr = f.variants.map((v) => (!v.name.trim() ? 'Name fehlt' : Number.isNaN(euroToCents(v.price)) || euroToCents(v.price) < 0 ? 'Preis ungültig' : !(Number(v.duration) >= 1 && Number(v.duration) <= 1440) ? 'Dauer 1–1440 Min.' : null));
  const errors = {
    name: !f.name.trim() ? 'Bitte einen Namen angeben.' : null,
    locationId: !f.locationId ? 'Bitte einen Standort wählen.' : null,
    price: f.price.trim() === '' || Number.isNaN(priceCents) || priceCents < 0 || priceCents > 10000000 ? 'Preis in Euro, z. B. 45,00.' : null,
    duration: !Number.isInteger(f.durationMinutes) || f.durationMinutes < 1 || f.durationMinutes > 1440 ? '1 bis 1440 Minuten.' : null,
    buffers: f.preparationMinutes < 0 || f.preparationMinutes > 240 || f.cleanupMinutes < 0 || f.cleanupMinutes > 240 ? 'Puffer 0 bis 240 Minuten.' : null,
    variants: variantErr.some(Boolean) ? 'Bitte Varianten prüfen.' : null,
  };
  const eligible = ws.employees.filter((e) => e.locationId === f.locationId || f.employeeIds.includes(e.id));
  const addCategory = () => {
    const name = newCat.trim();
    if (!name || createCat.isPending) return;
    setErr(null);
    createCat.mutate({ organizationId: ws.id, data: { name } }, {
      onSuccess: (w) => {
        sync(w, false);
        const group = w.serviceCategories.find((item) => item.name === name);
        if (group) setF((draft) => ({ ...draft, categoryId: group.id }));
        setNewCat('');
      },
      onError: (e2) => setErr(errOf(e2)),
    });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (createCat.isPending) return;
    setTouched(true); setErr(null);
    if (Object.values(errors).some(Boolean)) { setErr('Bitte prüfe die markierten Felder.'); return; }
    const data: ServiceInput = {
      name: f.name.trim(), description: f.description, locationId: f.locationId, categoryId: f.categoryId || null, priceCents,
      durationMinutes: f.durationMinutes, preparationMinutes: f.preparationMinutes, cleanupMinutes: f.cleanupMinutes, published: f.published, onlineBooking: f.onlineBooking,
      employeeIds: f.employeeIds,
      variants: f.variants.map((v) => ({ ...(v.id ? { id: v.id } : {}), name: v.name.trim(), priceCents: euroToCents(v.price), durationMinutes: Number(v.duration) })),
    };
    const h = { onSuccess: (w: BusinessWorkspace) => { sync(w); onDone(); }, onError: (e2: unknown) => setErr(errOf(e2)) };
    if (service) save.mutate({ organizationId: ws.id, serviceId: service.id, data }, h);
    else create.mutate({ organizationId: ws.id, data }, h);
  };
  const id = service?.id ?? 'new';
  const t = (k: keyof typeof errors) => (touched ? errors[k] : null);
  const setV = (i: number, v: Partial<VariantDraft>) => setF({ ...f, variants: f.variants.map((x, j) => (j === i ? { ...x, ...v } : x)) });
  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-xl border border-border bg-background/60 p-5" data-testid={`form-service-${id}`}>
      <div className="grid gap-4 sm:grid-cols-6">
        <Field id={`svc-${id}-name`} label="Name der Leistung" error={t('name')} className="sm:col-span-4"><input id={`svc-${id}-name`} value={f.name} maxLength={150} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} data-testid="input-service-name" /></Field>
        <Field id={`svc-${id}-location`} label="Standort" error={t('locationId')} className="sm:col-span-2">
          <select id={`svc-${id}-location`} value={f.locationId} onChange={(e) => setF({ ...f, locationId: e.target.value })} className={inputCls} data-testid="select-service-location"><option value="">Bitte wählen</option>{ws.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        </Field>
        <Field id={`svc-${id}-desc`} label="Beschreibung" className="sm:col-span-6"><textarea id={`svc-${id}-desc`} rows={2} maxLength={2000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={inputCls} data-testid="input-service-description" /></Field>
        <Field id={`svc-${id}-price`} label="Preis (Euro)" error={t('price')} className="sm:col-span-3"><input id={`svc-${id}-price`} inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="45,00" className={inputCls} data-testid="input-service-price" /></Field>
        <Field id={`svc-${id}-duration`} label="Dauer (Minuten)" error={t('duration')} className="sm:col-span-3"><input id={`svc-${id}-duration`} type="number" min={1} max={1440} value={f.durationMinutes} onChange={(e) => setF({ ...f, durationMinutes: Number(e.target.value) })} className={inputCls} data-testid="input-service-duration" /></Field>
        <fieldset className="min-w-0 space-y-3 rounded-lg border border-border p-3 sm:col-span-6">
          <legend className="px-1 text-sm font-medium">Leistungsgruppe (optional)</legend>
          <p className="text-sm text-muted-foreground">Gruppen ordnen deine Leistungen für Kund:innen, z. B. Massagen oder Gesichtsbehandlungen.</p>
          {ws.serviceCategories.length === 0 && <p className="text-sm text-muted-foreground">Du hast noch keine Gruppen. Du kannst hier eine anlegen oder die Leistung ohne Gruppe speichern.</p>}
          <Field id={`svc-${id}-category`} label="Gruppe auswählen">
            <select id={`svc-${id}-category`} value={f.categoryId ?? ''} onChange={(e) => setF({ ...f, categoryId: e.target.value || null })} className={inputCls} data-testid="select-service-category">
              <option value="">Ohne Gruppe</option>
              {ws.serviceCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field id={`svc-${id}-newcat`} label="Name der neuen Gruppe">
            <input id={`svc-${id}-newcat`} value={newCat} maxLength={100} onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
              disabled={createCat.isPending} placeholder="z. B. Massagen" className={inputCls} data-testid="input-new-service-category" />
          </Field>
          <PrimaryButton type="button" variant="ghost" onClick={addCategory} pending={createCat.isPending} disabled={!newCat.trim()} testId="button-create-service-category">
            <Plus className="h-4 w-4" />Gruppe anlegen
          </PrimaryButton>
        </fieldset>
        <Field id={`svc-${id}-prep`} label="Vorbereitung (Min.)" error={t('buffers')} className="sm:col-span-3"><input id={`svc-${id}-prep`} type="number" min={0} max={240} value={f.preparationMinutes} onChange={(e) => setF({ ...f, preparationMinutes: Number(e.target.value) })} className={inputCls} data-testid="input-service-preparation" /></Field>
        <Field id={`svc-${id}-clean`} label="Nachbereitung (Min.)" className="sm:col-span-3"><input id={`svc-${id}-clean`} type="number" min={0} max={240} value={f.cleanupMinutes} onChange={(e) => setF({ ...f, cleanupMinutes: Number(e.target.value) })} className={inputCls} data-testid="input-service-cleanup" /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Check id={`svc-${id}-published`} label="Öffentlich anzeigen" hint="Erscheint im Profil, sobald der Standort veröffentlicht ist" checked={f.published} onChange={(v) => setF({ ...f, published: v })} />
        <Check id={`svc-${id}-online`} label="Online-Buchung anbieten" hint="Erfordert eine veröffentlichte Leistung und verfügbare Mitarbeitende" checked={f.onlineBooking} onChange={(v) => setF({ ...f, onlineBooking: v })} />
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Mitarbeitende für diese Leistung</legend>
        <p className="mb-2 text-sm text-muted-foreground">Wähle die Personen aus, die diese Leistung anbieten.</p>
        {eligible.length === 0 ? <p className="text-sm text-muted-foreground">Für diesen Standort gibt es noch keine Mitarbeitenden.</p> : (
          <div className="flex flex-wrap gap-2">
            {eligible.map((e) => {
              const on = f.employeeIds.includes(e.id);
              return <button key={e.id} type="button" aria-pressed={on} onClick={() => setF({ ...f, employeeIds: on ? f.employeeIds.filter((x) => x !== e.id) : [...f.employeeIds, e.id] })} data-testid={`toggle-service-employee-${e.id}`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-secondary'}`}>{on && <CheckIcon className="h-3.5 w-3.5" />}{e.displayName}</button>;
            })}
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Leistungsvarianten (optional)</legend>
        <p className="mb-2 text-sm text-muted-foreground">Varianten sind buchbare Optionen derselben Leistung, z. B. 45 oder 60 Minuten Massage zu unterschiedlichen Preisen.</p>
        <div className="space-y-2">
          {f.variants.map((v, i) => (
            <div key={v.id ?? `n${i}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_6rem_auto]">
              <label className="sr-only" htmlFor={`svc-${id}-v${i}-name`}>Variante {i + 1} Name</label>
              <input id={`svc-${id}-v${i}-name`} value={v.name} maxLength={100} onChange={(e) => setV(i, { name: e.target.value })} placeholder="z. B. 60 Minuten" className={`${inputCls} col-span-full sm:col-span-1`} data-testid={`input-variant-name-${i}`} />
              <label className="sr-only" htmlFor={`svc-${id}-v${i}-price`}>Variante {i + 1} Preis</label>
              <input id={`svc-${id}-v${i}-price`} inputMode="decimal" value={v.price} onChange={(e) => setV(i, { price: e.target.value })} placeholder="Euro" className={inputCls} data-testid={`input-variant-price-${i}`} />
              <label className="sr-only" htmlFor={`svc-${id}-v${i}-duration`}>Variante {i + 1} Dauer</label>
              <input id={`svc-${id}-v${i}-duration`} type="number" min={1} value={v.duration} onChange={(e) => setV(i, { duration: e.target.value })} placeholder="Min." className={inputCls} data-testid={`input-variant-duration-${i}`} />
              <button type="button" onClick={() => setF({ ...f, variants: f.variants.filter((_, j) => j !== i) })} className="rounded-full p-2 hover:bg-secondary" aria-label={`Variante ${i + 1} entfernen`} data-testid={`button-remove-variant-${i}`}><Trash2 className="h-4 w-4" /></button>
              {touched && variantErr[i] && <p className="col-span-full text-xs text-destructive">{variantErr[i]}</p>}
            </div>
          ))}
          {f.variants.length < 30 && <button type="button" onClick={() => setF({ ...f, variants: [...f.variants, { name: '', price: f.price, duration: String(f.durationMinutes) }] })} className="inline-flex items-center gap-1 text-sm text-primary hover:underline" data-testid="button-add-variant"><Plus className="h-3.5 w-3.5" />Variante hinzufügen</button>}
        </div>
      </fieldset>
      <FormStatus error={err} />
      <div className="flex gap-2">
        <PrimaryButton pending={create.isPending || save.isPending} disabled={!perms.canEdit || createCat.isPending} testId="button-save-service">{service ? 'Speichern' : 'Leistung anlegen'}</PrimaryButton>
        <PrimaryButton type="button" variant="ghost" onClick={onDone} testId="button-cancel-service">Abbrechen</PrimaryButton>
      </div>
    </form>
  );
}

export function ServicesSection({ ws, perms }: Props) {
  const sync = useWorkspaceSync(ws.id);
  const archive = useArchiveBusinessService();
  const [editing, setEditing] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const active = ws.services.filter((s) => !s.archived);
  const archived = ws.services.filter((s) => s.archived);
  const groups = useMemo(() => {
    const m = new Map<string, ManagedService[]>();
    for (const s of active) { const k = s.categoryId ?? ''; m.set(k, [...(m.get(k) ?? []), s]); }
    return [...m.entries()];
  }, [active]);
  const catName = (id: string) => ws.serviceCategories.find((c) => c.id === id)?.name ?? 'Ohne Gruppe';
  const empName = (id: string) => ws.employees.find((e) => e.id === id)?.displayName;
  const doArchive = (s: ManagedService) => {
    setErr(null);
    archive.mutate({ organizationId: ws.id, serviceId: s.id }, { onSuccess: (w) => sync(w), onError: (e) => setErr(errOf(e)) });
  };
  return (
    <Panel title="Leistungen" kicker={`${active.length} aktiv · ${ws.serviceCategories.length} Gruppen`}
      actions={perms.canEdit && editing !== 'new' ? <PrimaryButton type="button" variant="ghost" disabled={!ws.locations.length} onClick={() => setEditing('new')} testId="button-add-service"><Plus className="h-4 w-4" />Leistung hinzufügen</PrimaryButton> : undefined}>
      {!ws.locations.length && perms.canEdit && <ReadOnlyNote>Lege zuerst einen Standort an — Leistungen gehören zu einem Standort.</ReadOnlyNote>}
      <FormStatus error={err} />
      {editing === 'new' && <div className="mb-5"><ServiceForm ws={ws} perms={perms} onDone={() => setEditing(null)} /></div>}
      {active.length === 0 && editing !== 'new' ? <EmptyNote title="Noch keine Leistungen.">Lege an, was du anbietest — mit Preis, Dauer und wer es macht.</EmptyNote> : (
        <div className="space-y-6">
          {groups.map(([cid, list]) => (
            <div key={cid || 'none'}>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{cid ? catName(cid) : 'Ohne Gruppe'}</p>
              <ul className="space-y-2">
                {list.map((s) => editing === s.id ? <li key={s.id}><ServiceForm ws={ws} perms={perms} service={s} onDone={() => setEditing(null)} /></li> : (
                  <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border p-4" data-testid={`row-service-${s.id}`}>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">{s.name}
                        {!s.published && <span className="rounded-full border border-dashed border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">verborgen</span>}
                        {s.onlineBooking && <span className="rounded-full bg-accent/25 px-2 py-0.5 font-mono text-[10px]">online vorgesehen</span>}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{formatDuration(s.durationMinutes)}{s.preparationMinutes || s.cleanupMinutes ? ` · Puffer ${s.preparationMinutes}+${s.cleanupMinutes} Min.` : ''} · {ws.locations.find((l) => l.id === s.locationId)?.name}</p>
                      {s.employeeIds.length > 0 && <p className="mt-1 text-xs">{s.employeeIds.map(empName).filter(Boolean).join(', ')}</p>}
                      {s.variants.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Varianten: {s.variants.map((v) => `${v.name} ${formatCents(v.priceCents)}`).join(' · ')}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-xl text-primary" data-testid={`text-service-price-${s.id}`}>{formatCents(s.priceCents)}</span>
                      {perms.canEdit && <>
                        <button type="button" onClick={() => setEditing(s.id)} className="rounded-full border border-border p-2 hover:bg-secondary" aria-label={`${s.name} bearbeiten`} data-testid={`button-edit-service-${s.id}`}><Pencil className="h-3.5 w-3.5" /></button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><button type="button" className="rounded-full border border-border p-2 hover:bg-secondary" aria-label={`${s.name} archivieren`} data-testid={`button-archive-service-${s.id}`}><Archive className="h-3.5 w-3.5" /></button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle className="font-display text-2xl">„{s.name}“ archivieren?</AlertDialogTitle>
                              <AlertDialogDescription>Die Leistung verschwindet aus dem öffentlichen Profil. Sie bleibt für spätere Verweise erhalten und wird nicht gelöscht.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Abbrechen</AlertDialogCancel><AlertDialogAction onClick={() => doArchive(s)} data-testid={`button-confirm-archive-${s.id}`}>Archivieren</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {archived.length > 0 && (
        <div className="mt-6 border-t border-dashed border-border pt-4">
          <button type="button" onClick={() => setShowArchived(!showArchived)} className="text-sm text-muted-foreground underline" data-testid="button-toggle-archived">{showArchived ? 'Archivierte ausblenden' : `${archived.length} archivierte anzeigen`}</button>
          {showArchived && <ul className="mt-3 space-y-1 text-sm text-muted-foreground">{archived.map((s) => <li key={s.id} data-testid={`row-archived-service-${s.id}`}>{s.name} · {formatCents(s.priceCents)}</li>)}</ul>}
        </div>
      )}
    </Panel>
  );
}

/* ---------- Cancellation policy ---------- */
export function PolicySection({ ws, perms }: Props) {
  const sync = useWorkspaceSync(ws.id);
  const save = useSaveCancellationPolicy();
  const versions = useMemo(() => [...ws.policies].sort((a, b) => b.version - a.version), [ws.policies]);
  const cur = versions[0];
  const fromPolicy = (p?: PolicyInput) => ({
    rescheduleNoticeHours: p?.rescheduleNoticeHours ?? 0,
    noticeHours: p?.noticeHours ?? 24, lateFeeType: p?.lateFeeType ?? 'percentage', lateFee: p ? (p.lateFeeType === 'fixed' ? centsToEuro(p.lateFeeValue) : String(p.lateFeeValue)) : '100',
    noShowFeeType: p?.noShowFeeType ?? 'percentage', noShowFee: p ? (p.noShowFeeType === 'fixed' ? centsToEuro(p.noShowFeeValue) : String(p.noShowFeeValue)) : '100',
    waiverAllowed: p?.waiverAllowed ?? true, exceptions: p?.exceptions ?? '',
  });
  const [f, setF] = useState(() => fromPolicy(cur));
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const val = (type: string, v: string) => (type === 'fixed' ? euroToCents(v) : Number(v.replace(',', '.')));
  const late = val(f.lateFeeType, f.lateFee), noShow = val(f.noShowFeeType, f.noShowFee);
  const errors = {
    reschedule: !Number.isInteger(f.rescheduleNoticeHours) || f.rescheduleNoticeHours < 0 || f.rescheduleNoticeHours > 720 ? "0 bis 720 Stunden." : null,
    notice: !Number.isInteger(f.noticeHours) || f.noticeHours < 0 || f.noticeHours > 720 ? '0 bis 720 Stunden.' : null,
    late: !Number.isFinite(late) || late < 0 || (f.lateFeeType === 'percentage' && late > 100) ? (f.lateFeeType === 'percentage' ? '0 bis 100 %.' : 'Betrag in Euro.') : null,
    noShow: !Number.isFinite(noShow) || noShow < 0 || (f.noShowFeeType === 'percentage' && noShow > 100) ? (f.noShowFeeType === 'percentage' ? '0 bis 100 %.' : 'Betrag in Euro.') : null,
  };
  const submit = (e: FormEvent) => {
    e.preventDefault(); setErr(null); setOk(null);
    if (Object.values(errors).some(Boolean)) { setErr('Bitte prüfe die markierten Felder.'); return; }
    const data: PolicyInput = { rescheduleNoticeHours: f.rescheduleNoticeHours, noticeHours: f.noticeHours, lateFeeType: f.lateFeeType, lateFeeValue: Math.round(late), noShowFeeType: f.noShowFeeType, noShowFeeValue: Math.round(noShow), waiverAllowed: f.waiverAllowed, exceptions: f.exceptions };
    save.mutate({ organizationId: ws.id, data }, { onSuccess: (w) => { sync(w); setOk('Neue Richtlinienversion gespeichert.'); }, onError: (e2) => setErr(errOf(e2)) });
  };
  return (
    <Panel title="Stornierungsregeln" kicker={cur ? `Version ${cur.version}` : 'Standardwerte'}>
      <div className="mb-5 rounded-xl border border-accent/50 bg-accent/15 p-4 text-sm" data-testid="text-policy-warning">
        <p className="font-semibold">Keine Gebühren werden eingezogen.</p>
        <p className="mt-1 text-muted-foreground">Diese Werte werden als Regelwerk gespeichert. Ob eine Gebühr — etwa 100 % bei Nichterscheinen — in Deutschland durchsetzbar ist, hängt vom Einzelfall ab und erfordert rechtliche Prüfung sowie eine gültige Zahlungsautorisierung der Kundin oder des Kunden. Zahlungen folgen erst in einer späteren Stufe.</p>
      </div>
      {!perms.canEdit && <ReadOnlyNote>Nur Inhaber:innen und Leitungen können die Regeln ändern.</ReadOnlyNote>}
      <form onSubmit={submit} noValidate>
        <fieldset disabled={!perms.canEdit} className="grid gap-4 sm:grid-cols-2">
          <Field id="reschedule-notice" label="Online umbuchen bis (Stunden vorher)" error={errors.reschedule}>
            <input id="reschedule-notice" type="number" min={0} max={720} value={f.rescheduleNoticeHours}
              onChange={(event) => setF({ ...f, rescheduleNoticeHours: Number(event.target.value) })} className={inputCls} />
          </Field>
          <Field id="policy-notice" label="Kostenlos stornierbar bis (Stunden vorher)" error={errors.notice} className="sm:col-span-2"><input id="policy-notice" type="number" min={0} max={720} value={f.noticeHours} onChange={(e) => setF({ ...f, noticeHours: Number(e.target.value) })} className={inputCls} data-testid="input-policy-notice" /></Field>
          <Field id="policy-late-type" label="Späte Stornierung: Art"><select id="policy-late-type" value={f.lateFeeType} onChange={(e) => setF({ ...f, lateFeeType: e.target.value as PolicyInput['lateFeeType'] })} className={inputCls} data-testid="select-policy-late-type"><option value="percentage">Prozent der Leistung</option><option value="fixed">Fester Betrag</option></select></Field>
          <Field id="policy-late-value" label={f.lateFeeType === 'percentage' ? 'Späte Stornierung: Prozent' : 'Späte Stornierung: Euro'} error={errors.late}><input id="policy-late-value" inputMode="decimal" value={f.lateFee} onChange={(e) => setF({ ...f, lateFee: e.target.value })} className={inputCls} data-testid="input-policy-late-value" /></Field>
          <Field id="policy-noshow-type" label="Nichterscheinen: Art"><select id="policy-noshow-type" value={f.noShowFeeType} onChange={(e) => setF({ ...f, noShowFeeType: e.target.value as PolicyInput['noShowFeeType'] })} className={inputCls} data-testid="select-policy-noshow-type"><option value="percentage">Prozent der Leistung</option><option value="fixed">Fester Betrag</option></select></Field>
          <Field id="policy-noshow-value" label={f.noShowFeeType === 'percentage' ? 'Nichterscheinen: Prozent' : 'Nichterscheinen: Euro'} error={errors.noShow}><input id="policy-noshow-value" inputMode="decimal" value={f.noShowFee} onChange={(e) => setF({ ...f, noShowFee: e.target.value })} className={inputCls} data-testid="input-policy-noshow-value" /></Field>
          <div className="sm:col-span-2"><Check id="policy-waiver" label="Kulanz erlaubt" hint="Gebühren dürfen im Einzelfall erlassen werden" checked={f.waiverAllowed} onChange={(v) => setF({ ...f, waiverAllowed: v })} /></div>
          <Field id="policy-exceptions" label="Ausnahmen (optional)" className="sm:col-span-2"><textarea id="policy-exceptions" rows={3} maxLength={2000} value={f.exceptions} onChange={(e) => setF({ ...f, exceptions: e.target.value })} placeholder="z. B. Krankheit mit Attest" className={inputCls} data-testid="input-policy-exceptions" /></Field>
        </fieldset>
        <div className="mt-5 space-y-3"><FormStatus error={err} success={ok} />{perms.canEdit && <PrimaryButton pending={save.isPending} testId="button-save-policy">Als neue Version speichern</PrimaryButton>}</div>
      </form>
      {versions.length > 0 && (
        <div className="mt-6 border-t border-dashed border-border pt-4">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Versionen</p>
          <ol className="space-y-1 text-sm">{versions.map((p) => (
            <li key={p.id} className="flex flex-wrap justify-between gap-2" data-testid={`row-policy-version-${p.version}`}>
              <span>Version {p.version} · {p.noticeHours} Std. · spät {p.lateFeeType === 'fixed' ? formatCents(p.lateFeeValue) : `${p.lateFeeValue} %`} · No-Show {p.noShowFeeType === 'fixed' ? formatCents(p.noShowFeeValue) : `${p.noShowFeeValue} %`}</span>
              <span className="font-mono text-xs text-muted-foreground">{formatDateTime(p.createdAt)}</span>
            </li>
          ))}</ol>
        </div>
      )}
    </Panel>
  );
}

/* ---------- Publication ---------- */
export function PublicationPanel({ ws, perms }: Props) {
  const sync = useWorkspaceSync(ws.id);
  const pub = useSetBusinessPublication();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const toggle = (l: ManagedLocation, published: boolean) => {
    setErr(null); setOk(null);
    pub.mutate({ organizationId: ws.id, data: { locationId: l.id, published } }, {
      onSuccess: (w) => { sync(w); setOk(published ? `${l.name} ist jetzt öffentlich sichtbar.` : `${l.name} ist wieder ein Entwurf.`); },
      onError: (e) => setErr(errOf(e)),
    });
  };
  return (
    <Panel title="Veröffentlichung" kicker="Kontrolliert">
      {ws.publicationIssues.length > 0 ? (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4" data-testid="list-publication-issues">
          <p className="text-sm font-semibold">Vor der Veröffentlichung noch offen:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{ws.publicationIssues.map((i) => <li key={i}>{i}</li>)}</ul>
        </div>
      ) : <p className="mb-4 rounded-xl bg-secondary/70 p-4 text-sm" data-testid="text-publication-ready">Alle Pflichtangaben sind vollständig.</p>}
      {ws.locations.length === 0 ? <p className="text-sm text-muted-foreground">Kein Standort vorhanden.</p> : (
        <ul className="space-y-2">
          {ws.locations.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4" data-testid={`row-publication-${l.id}`}>
              <div><p className="font-semibold">{l.name}</p><p className="text-sm text-muted-foreground">{l.published ? `Öffentlich unter /salons/${l.slug}` : 'Entwurf — nicht öffentlich sichtbar'}</p></div>
              {perms.isOwner && (l.published
                ? <PrimaryButton type="button" variant="ghost" pending={pub.isPending} onClick={() => toggle(l, false)} testId={`button-unpublish-${l.id}`}>Offline nehmen</PrimaryButton>
                : <PrimaryButton type="button" pending={pub.isPending} disabled={l.id === ws.locations[0]?.id && ws.publicationIssues.length > 0} onClick={() => toggle(l, true)} testId={`button-publish-${l.id}`}>Veröffentlichen</PrimaryButton>)}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4"><FormStatus error={err} success={ok} /></div>
    </Panel>
  );
}

/* ---------- Organization settings: memberships + invitations ---------- */
function MembershipRow({ ws, m, perms }: Props & { m: ManagedMembership }) {
  const sync = useWorkspaceSync(ws.id);
  const save = useSaveOrganizationMembership();
  const [err, setErr] = useState<string | null>(null);
  const editable = perms.isOwner && m.role !== 'owner' && m.status !== 'removed';
  const update = (role: 'manager' | 'employee', status: 'active' | 'inactive' | 'removed') => {
    setErr(null);
    save.mutate({ organizationId: ws.id, membershipId: m.id, data: { role, status } }, { onSuccess: (w) => sync(w, false), onError: (e) => setErr(errOf(e)) });
  };
  const role = (m.role === 'manager' ? 'manager' : 'employee') as 'manager' | 'employee';
  const status = (m.status === 'inactive' ? 'inactive' : 'active') as 'active' | 'inactive';
  return (
    <li className="rounded-xl border border-border p-4" data-testid={`row-membership-${m.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-semibold">{m.displayName || m.email}</p><p className="text-sm text-muted-foreground">{m.email}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {editable ? (
            <>
              <label className="sr-only" htmlFor={`m-${m.id}-role`}>Rolle von {m.displayName}</label>
              <select id={`m-${m.id}-role`} value={role} disabled={save.isPending} onChange={(e) => update(e.target.value as 'manager' | 'employee', status)} className={`${inputCls} w-auto py-1.5`} data-testid={`select-membership-role-${m.id}`}><option value="manager">Leitung</option><option value="employee">Mitarbeiter:in</option></select>
              <PrimaryButton type="button" variant="ghost" pending={save.isPending} onClick={() => update(role, status === 'active' ? 'inactive' : 'active')} testId={`button-toggle-membership-${m.id}`}>{status === 'active' ? 'Deaktivieren' : 'Aktivieren'}</PrimaryButton>
              <AlertDialog>
                <AlertDialogTrigger asChild><button type="button" className="rounded-full border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10" data-testid={`button-remove-membership-${m.id}`}>Zugang entfernen</button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle className="font-display text-2xl">Zugang entfernen?</AlertDialogTitle><AlertDialogDescription>{m.displayName || m.email} verliert den Zugriff auf diesen Betrieb. Das Mitarbeiterprofil bleibt erhalten.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Abbrechen</AlertDialogCancel><AlertDialogAction onClick={() => update(role, 'removed')} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid={`button-confirm-remove-${m.id}`}>Entfernen</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : (
            <span className="rounded-full bg-secondary px-3 py-1 font-mono text-[11px]">{roleLabel[m.role] ?? m.role} · {statusLabel[m.status] ?? m.status}</span>
          )}
        </div>
      </div>
      {err && <p className="mt-2 text-sm text-destructive" role="alert">{err}</p>}
    </li>
  );
}

export function InvitePanel({ ws, perms }: Props) {
  const qc = useQueryClient();
  const invite = useCreateStaffInvitation();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'manager' | 'employee'>('employee');
  const [locationId, setLocationId] = useState(ws.locations[0]?.id ?? '');
  const [delivery, setDelivery] = useState<InvitationDelivery | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const emailErr = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'Gültige E-Mail-Adresse angeben.' : null;
  const link = delivery ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/einladung#token=${encodeURIComponent(delivery.token)}` : '';
  const submit = (e: FormEvent) => {
    e.preventDefault(); setTouched(true); setErr(null); setDelivery(null); setCopied(false);
    if (emailErr || !locationId) { setErr(!locationId ? 'Bitte zuerst einen Standort anlegen.' : 'Bitte prüfe die E-Mail-Adresse.'); return; }
    invite.mutate({ organizationId: ws.id, data: { email: email.trim(), role, locationId } }, {
      onSuccess: (d) => { setDelivery(d); setEmail(''); setTouched(false); qc.invalidateQueries({ queryKey: getGetOrganizationWorkspaceQueryKey(ws.id) }); },
      onError: (e2) => setErr(errOf(e2)),
    });
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); } };
  if (!perms.canEdit) return null;
  return (
    <Panel title="Teammitglied einladen" kicker="Sicherer Einladungslink">
      <p className="mb-4 text-sm text-muted-foreground">BeautyHub verschickt noch keine E-Mails. Du erhältst einen einmaligen, ablaufenden Link und teilst ihn selbst — die Einladung kann nur mit der angegebenen E-Mail-Adresse angenommen werden.</p>
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-start">
        <Field id="invite-email" label="E-Mail-Adresse" error={touched ? emailErr : null}><input id="invite-email" type="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} data-testid="input-invite-email" /></Field>
        <Field id="invite-role" label="Rolle"><select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as 'manager' | 'employee')} className={inputCls} data-testid="select-invite-role"><option value="employee">Mitarbeiter:in</option>{perms.isOwner && <option value="manager">Leitung</option>}</select></Field>
        <Field id="invite-location" label="Standort"><select id="invite-location" value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputCls} data-testid="select-invite-location"><option value="">Bitte wählen</option>{ws.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <div className="sm:pt-7"><PrimaryButton pending={invite.isPending} testId="button-create-invitation"><Link2 className="h-4 w-4" />Link erzeugen</PrimaryButton></div>
      </form>
      <div className="mt-4"><FormStatus error={err} /></div>
      {delivery && (
        <div className="mt-4 rounded-xl border border-primary/30 bg-secondary/60 p-4" data-testid="card-invitation-link">
          <p className="text-sm font-semibold">Link wird nur jetzt angezeigt.</p>
          <p className="mt-1 text-xs text-muted-foreground">{delivery.message} Gültig bis {formatDateTime(delivery.expiresAt)}.</p>
          <div className="mt-3 flex gap-2">
            <label className="sr-only" htmlFor="invite-link">Einladungslink</label>
            <input id="invite-link" readOnly value={link} onFocus={(e) => e.target.select()} className={`${inputCls} font-mono text-xs`} data-testid="input-invitation-link" />
            <PrimaryButton type="button" variant="ghost" onClick={copy} testId="button-copy-invitation">{copied ? <CheckIcon className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Kopiert' : 'Kopieren'}</PrimaryButton>
          </div>
          <button type="button" onClick={() => setDelivery(null)} className="mt-3 text-xs underline" data-testid="button-dismiss-invitation">Ausblenden</button>
        </div>
      )}
    </Panel>
  );
}

export function OrganizationSettingsSection({ ws, perms }: Props) {
  return (
    <div className="space-y-6">
      <Panel title="Mitglieder & Rollen" kicker={`${ws.memberships.length} Mitgliedschaften`}>
        {!perms.isOwner && <ReadOnlyNote>Nur Inhaber:innen können Rollen ändern oder Zugänge entfernen.</ReadOnlyNote>}
        {ws.memberships.length === 0 ? <p className="text-sm text-muted-foreground">Keine Mitgliedschaften sichtbar.</p> : (
          <ul className="space-y-2">{ws.memberships.map((m) => <MembershipRow key={m.id} ws={ws} perms={perms} m={m} />)}</ul>
        )}
      </Panel>
      <InvitePanel ws={ws} perms={perms} />
      {perms.canEdit && (
        <Panel title="Einladungen" kicker={`${ws.invitations.filter((i) => !i.accepted).length} offen`}>
          {ws.invitations.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Einladungen erstellt.</p> : (
            <ul className="divide-y divide-dashed divide-border">{ws.invitations.map((i) => {
              const expired = !i.accepted && new Date(i.expiresAt).getTime() < Date.now();
              return (
                <li key={i.id} className="flex flex-wrap justify-between gap-2 py-2.5 text-sm" data-testid={`row-invitation-${i.id}`}>
                  <span>{i.email} · {roleLabel[i.role] ?? i.role}</span>
                  <span className="font-mono text-xs text-muted-foreground">{i.accepted ? 'angenommen' : expired ? 'abgelaufen' : `offen bis ${formatDateTime(i.expiresAt)}`}</span>
                </li>
              );
            })}</ul>
          )}
        </Panel>
      )}
    </div>
  );
}
