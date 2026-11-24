import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BusinessWorkspace, ManagedLocation } from '@workspace/api-client-react';
import { Field, FormStatus, Panel, PrimaryButton, inputCls } from '@/components/forms';
import { errorText } from '@/lib/api';
import { formatCents } from '@/lib/format';
import { appointmentLabel, dateInZone, sendBookingData, type Availability, type SelectionItem } from '@/lib/booking';

type Source = 'manual' | 'walk_in';

export function ManualAppointment({ workspace, onCreated }: { workspace: BusinessWorkspace; onCreated: (date: string, locationId: string) => void }) {
  const [visible, setVisible] = useState(false);
  const [locationId, setLocationId] = useState(workspace.locations[0]?.id ?? '');
  const location = workspace.locations.find((entry) => entry.id === locationId);
  return <Panel title="Termin eintragen" actions={
    <button type="button" className="underline" disabled={!location} aria-expanded={visible} onClick={() => setVisible(!visible)}>
      {visible ? 'Schließen' : 'Neuer Termin'}
    </button>
  }>
    {visible && location && <>
      <Field id="manual-location" label="Terminstandort">
        <select id="manual-location" className={inputCls} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          {workspace.locations.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </Field>
      <AppointmentEditor key={location.id} workspace={workspace} location={location} onComplete={(date) => { setVisible(false); onCreated(date, location.id); }} />
    </>}
  </Panel>;
}

function AppointmentEditor({ workspace, location, onComplete }: {
  workspace: BusinessWorkspace; location: ManagedLocation; onComplete: (date: string) => void;
}) {
  const qc = useQueryClient();
  const [source, setSource] = useState<Source>('manual');
  const [date, setDate] = useState(dateInZone(location.timezone));
  const [guestName, setGuestName] = useState('');
  const [items, setItems] = useState<SelectionItem[]>([]);
  const [selected, setSelected] = useState('');
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const slotId = useId();
  const path = `/api/organizations/${workspace.id}/booking-calendar`;
  const services = workspace.services.filter((entry) => entry.locationId === location.id && !entry.archived);
  const search = useMutation({ mutationFn: () => sendBookingData<Availability>(`${path}/availability`, {
    locationId: location.id, items, date, source,
  }) });
  const create = useMutation({
    mutationFn: (slot: Availability['slots'][number]) => sendBookingData(path, {
      locationId: location.id, items, source, guestName, employeeId: slot.employeeId, startsAt: slot.startsAt,
      idempotencyKey: requestKey,
    }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [path] });
      onComplete(date);
    },
  });
  const chosen = search.data?.slots.find((slot) => `${slot.employeeId}/${slot.startsAt}` === selected);
  const pending = search.isPending || create.isPending;
  const reset = () => { search.reset(); create.reset(); setSelected(''); setRequestKey(crypto.randomUUID()); };

  return <div className="mt-4 space-y-4">
    <div className="grid gap-3 sm:grid-cols-2">
      <Field id="manual-source" label="Terminart">
        <select id="manual-source" className={inputCls} value={source} disabled={pending} onChange={(e) => {
          const value = e.target.value as Source;
          setSource(value);
          if (value === 'walk_in') setDate(dateInZone(location.timezone));
          reset();
        }}>
          <option value="manual">Manueller Termin</option>
          <option value="walk_in">Laufkundschaft (heute)</option>
        </select>
      </Field>
      <Field id="manual-date" label="Datum">
        <input id="manual-date" type="date" className={inputCls} value={date} min={dateInZone(location.timezone)}
          disabled={pending || source === 'walk_in'} onChange={(e) => { setDate(e.target.value); reset(); }} />
      </Field>
    </div>
    <Field id="manual-guest" label="Name des Gasts">
      <input id="manual-guest" className={inputCls} value={guestName} maxLength={100} disabled={pending}
        onChange={(e) => { setGuestName(e.target.value); create.reset(); setRequestKey(crypto.randomUUID()); }} />
    </Field>
    <fieldset className="space-y-2">
      <legend className="font-medium">Leistungen</legend>
      {services.map((service) => {
        const item = items.find((entry) => entry.serviceId === service.id);
        return <div key={service.id} className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!item} disabled={pending || (!item && items.length >= 12)} onChange={() => {
              setItems(item ? items.filter((entry) => entry.serviceId !== service.id) : [...items, { serviceId: service.id }]);
              reset();
            }} />
            {service.name}
          </label>
          {!!item && !!service.variants.length && <select aria-label={`Variante für ${service.name}`} disabled={pending}
            value={item.variantId ?? ''} className="rounded-lg border border-border bg-background p-2" onChange={(e) => {
              setItems(items.map((entry) => entry.serviceId === service.id ? { ...entry, variantId: e.target.value || undefined } : entry));
              reset();
            }}>
            <option value="">Standard</option>
            {service.variants.map((variant) =>
              <option key={variant.id} value={variant.id}>{variant.name}</option>)}
          </select>}
        </div>;
      })}
      {!services.length && <p>Für diesen Standort sind keine Leistungen hinterlegt.</p>}
    </fieldset>
    <PrimaryButton type="button" testId="manual-availability" pending={search.isPending} disabled={!items.length || !date || pending}
      onClick={() => { reset(); search.mutate(); }}>Freie Zeiten suchen</PrimaryButton>
    {search.data && <>
      <p>{formatCents((chosen?.quote ?? search.data.quote).priceCents)} · {(chosen?.quote ?? search.data.quote).occupiedMinutes} Min. inkl. Puffer</p>
      {search.data.slots.length ? <Field id={slotId} label="Freie Zeiten">
        <select id={slotId} className={inputCls} value={selected} disabled={pending} onChange={(e) => {
          setSelected(e.target.value); create.reset(); setRequestKey(crypto.randomUUID());
        }}>
          <option value="">Zeit auswählen</option>
          {search.data.slots.map((slot) => <option key={`${slot.employeeId}/${slot.startsAt}`} value={`${slot.employeeId}/${slot.startsAt}`}>
            {appointmentLabel(slot.startsAt, location.timezone)} · {slot.employeeName}
          </option>)}
        </select>
      </Field> : <p role="status">Keine freien Termine für diese Auswahl.</p>}
      <PrimaryButton type="button" testId="manual-confirm" pending={create.isPending} disabled={!chosen || !guestName.trim() || pending}
        onClick={() => { if (chosen) create.mutate(chosen); }}>Termin speichern</PrimaryButton>
    </>}
    <FormStatus error={search.error || create.error ? errorText(search.error ?? create.error) : null} />
  </div>;
}
