import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BusinessWorkspace } from '@workspace/api-client-react';
import { PosVouchers } from '@/components/pos-vouchers';
import { RetailCheckout } from '@/components/retail-checkout';
import { AppointmentTransactions } from '@/components/appointment-transactions';
import { AppointmentPayments } from '@/components/appointment-payments';
import { CalendarMove } from '@/components/calendar-move';
import { ManualAppointment } from '@/components/manual-appointment';
import { Field, FormStatus, Panel, PrimaryButton, inputCls } from '@/components/forms';
import { errorText } from '@/lib/api';
import { appointmentLabel, dateInZone, getBookingData, sendBookingData, statusLabel, type Booking } from '@/lib/booking';

function dayAt(value: string, zone: string) {
  return new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone }).format(new Date(value));
}

export function BusinessCalendar({ workspace }: { workspace: BusinessWorkspace }) {
  const [date, setDate] = useState(dateInZone(workspace.locations[0]?.timezone ?? 'Europe/Berlin'));
  const [period, setPeriod] = useState('week');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [dragged, setDragged] = useState<Booking>();
  const [moveTarget, setMoveTarget] = useState<{ booking: Booking; date: string }>();
  const qc = useQueryClient();
  const start = new Date(date + 'T00:00:00Z');
  if (period === 'month') start.setUTCDate(1);
  if (period === 'week') start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  const end = new Date(start);
  if (period === 'month') end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCDate(end.getUTCDate() + (period === 'week' ? 7 : 1));
  const startDay = start.toISOString().slice(0, 10);
  const endDay = end.toISOString().slice(0, 10);
  const path = `/api/organizations/${workspace.id}/booking-calendar`;
  const params = new URLSearchParams({
    from: new Date(+start - 14 * 3600000).toISOString(),
    to: new Date(+end + 14 * 3600000).toISOString(),
  });
  const list = useQuery({ queryKey: [path, startDay, endDay], refetchInterval: 15000, refetchOnWindowFocus: 'always', queryFn: ({ signal }) => getBookingData<Booking[]>(`${path}?${params}`, signal) });
  const waitlist = useQuery({ queryKey: [path, 'waitlist'], queryFn: ({ signal }) =>
    getBookingData<{ locationId: string; date: string; salon: string; createdAt: string }[]>(`${path}/waitlist`, signal) });
  const change = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => sendBookingData(`${path}/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [path] }),
  });
  const filtered = list.data?.filter((booking) => {
    const day = dayAt(booking.startsAt, booking.timezone);
    return day >= startDay && day < endDay && (!selectedLocation || booking.locationId === selectedLocation) && (!employeeId || booking.employeeId === employeeId || booking.items.some((item) => item.employeeId === employeeId));
  });
  const days = Array.from({ length: (+end - +start) / 86400000 }, (_, index) =>
    new Date(+start + index * 86400000).toISOString().slice(0, 10));
  const canMove = (booking: Booking) => booking.status === 'confirmed' && Date.parse(booking.startsAt) > Date.now();
  return <div className="space-y-6">
    <ManualAppointment workspace={workspace} onCreated={(value, locationId) => { setDate(value); setSelectedLocation(locationId); setEmployeeId(''); }} />
    <Panel title="Kalender">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field id="calendar-date" label="Datum"><input id="calendar-date" type="date" className={inputCls} value={date}
          onChange={(event) => { if (event.target.value) setDate(event.target.value); }} /></Field>
        <Field id="calendar-period" label="Ansicht"><select id="calendar-period" className={inputCls} value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="day">Tag</option><option value="week">Woche</option><option value="month">Monat</option>
        </select></Field>
        <Field id="calendar-location" label="Standort"><select id="calendar-location" className={inputCls} value={selectedLocation} onChange={(e) => { setSelectedLocation(e.target.value); setEmployeeId(''); }}>
          <option value="">Alle Standorte</option>
          {workspace.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select></Field>
        <Field id="calendar-employee" label="Teammitglied">
          <select id="calendar-employee" className={inputCls} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Alle Mitarbeitenden</option>
            {workspace.employees.filter((entry) => !selectedLocation || entry.locationId === selectedLocation)
              .map((entry) => <option key={entry.id} value={entry.id}>{entry.displayName}</option>)}
          </select>
        </Field>
      </div>
      {dragged && <div className="mt-4 flex flex-wrap gap-2" aria-label="Termindatum für Verschiebung">
        {days.map((day) => <div key={day} className="rounded-lg border border-dashed border-primary px-3 py-2 text-sm"
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
          onDrop={(event) => {
            event.preventDefault();
            if (event.dataTransfer.getData('text/plain') !== dragged.id) return;
            setMoveTarget({ booking: dragged, date: day });
            setDragged(undefined);
          }}>{day}</div>)}
      </div>}
      {moveTarget && <CalendarMove key={`${moveTarget.booking.id}/${moveTarget.date}`} booking={moveTarget.booking}
        initialDate={moveTarget.date} path={path} onClose={() => setMoveTarget(undefined)}
        onComplete={(value) => { setDate(value); setMoveTarget(undefined); void qc.invalidateQueries({ queryKey: [path] }); }} />}
      {list.isPending ? <p role="status">Termine werden geladen …</p>
        : list.isError ? <button type="button" className="underline" onClick={() => list.refetch()}>Kalender erneut laden</button>
        : !filtered?.length ? <p className="mt-4">Keine Termine in dieser Ansicht.</p>
        : <ul className="mt-4 divide-y divide-border">
          {filtered.map((booking) => <li key={booking.id} className="space-y-2 py-3" draggable={canMove(booking)}
            onDragStart={(event) => { event.dataTransfer.setData('text/plain', booking.id); event.dataTransfer.effectAllowed = 'move'; setDragged(booking); }}
            onDragEnd={() => setDragged(undefined)}>
            <p className="font-medium">{appointmentLabel(booking.startsAt, booking.timezone)} · {booking.salon} · {statusLabel[booking.status]}</p>
            {booking.appointmentNote && <p className="whitespace-pre-wrap break-words text-sm">{booking.appointmentNote}</p>}
            <p className="text-sm">{booking.employeeName} · {booking.customerName}{booking.source === 'walk_in' ? ' · Laufkundschaft' : booking.source === 'manual' ? ' · Manuell' : ''} · {booking.items.map((item) => [item.name, item.professionalName].filter(Boolean).join(' · ')).join(', ')}</p>
            <AppointmentPayments booking={booking} calendarPath={path} organizationId={workspace.id} />
            {booking.status === 'confirmed' && <div className="flex flex-wrap gap-3 text-sm">
              {canMove(booking) && <button type="button" className="underline" onClick={() => setMoveTarget({ booking, date: dayAt(booking.startsAt, booking.timezone) })}>Verschieben</button>}
              <button type="button" className="underline" disabled={change.isPending}
                onClick={() => { if (window.confirm('Termin wirklich stornieren?')) change.mutate({ id: booking.id, status: 'cancelled' }); }}>Stornieren</button>
              {Date.parse(booking.endsAt) <= Date.now() && <button type="button" className="underline" disabled={change.isPending}
                onClick={() => change.mutate({ id: booking.id, status: 'completed' })}>Abschließen</button>}
              {Date.parse(booking.startsAt) <= Date.now() && <button type="button" className="underline" disabled={change.isPending}
                onClick={() => change.mutate({ id: booking.id, status: 'no_show' })}>Nichterscheinen erfassen</button>}
            </div>}
          </li>)}
        </ul>}
      <FormStatus error={change.error ? errorText(change.error) : null} />
    </Panel>
    <RetailCheckout workspace={workspace} />
    <PosVouchers organizationId={workspace.id} />
    <AppointmentTransactions workspace={workspace} />
    <Panel title="Warteliste">
      {waitlist.isPending ? <p role="status">Warteliste wird geladen …</p>
        : waitlist.isError ? <button type="button" className="underline" onClick={() => waitlist.refetch()}>Warteliste erneut laden</button>
        : !waitlist.data.length ? <p>Keine Einträge.</p>
        : <ul className="space-y-2">{waitlist.data.map((entry, index) =>
          <li key={`${entry.locationId}/${entry.createdAt}/${index}`}>{entry.date} · {entry.salon}</li>)}</ul>}
    </Panel>
  </div>;
}

type Settings = {
  blocks: { id: string; startsAt: string; endsAt: string; reason: string; employeeId: string | null }[];
  resources: { id: string; name: string; serviceIds: string[] }[];
};

export function BookingSettings({ workspace }: { workspace: BusinessWorkspace }) {
  const [selected, setSelected] = useState(workspace.locations[0]?.id ?? '');
  const location = workspace.locations.find((entry) => entry.id === selected);
  return <Panel title="Sperrzeiten und Ressourcen">
    <Field id="schedule-location" label="Standort">
      <select id="schedule-location" className={inputCls} value={selected} onChange={(event) => setSelected(event.target.value)}>
        {workspace.locations.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}
      </select>
    </Field>
    {location && <LocationSettings key={location.id} workspace={workspace} locationId={location.id} timezone={location.timezone} />}
  </Panel>;
}

function LocationSettings({ workspace, locationId, timezone }: { workspace: BusinessWorkspace; locationId: string; timezone: string }) {
  const path = `/api/organizations/${workspace.id}/locations/${locationId}/booking-settings`;
  const qc = useQueryClient();
  const query = useQuery({ queryKey: [path], queryFn: ({ signal }) => getBookingData<Settings>(path, signal) });
  const change = useMutation({
    mutationFn: ({ url, data, method }: { url: string; data?: unknown; method?: string }) => sendBookingData(path + url, data, method),
    onSuccess: () => qc.invalidateQueries({ queryKey: [path] }),
  });
  const staff = workspace.employees.filter((entry) => entry.locationId === locationId);
  const services = workspace.services.filter((entry) => entry.locationId === locationId && !entry.archived);
  const block = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const from = new Date(String(fields.get('from')) + 'Z');
    const to = new Date(String(fields.get('to')) + 'Z');
    change.mutate({ url: '/blocks', data: {
      reason: fields.get('reason'), employeeId: fields.get('employee') || undefined, startsAt: from.toISOString(), endsAt: to.toISOString(),
    } }, { onSuccess: () => form.reset() });
  };
  const resource = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    change.mutate({ url: '/resources', data: { name: fields.get('name'), serviceIds: fields.getAll('service') } }, { onSuccess: () => form.reset() });
  };
  return <div className="mt-5 space-y-6">
    <form className="space-y-3" onSubmit={block}>
      <h3 className="font-medium">Sperrzeit hinzufügen</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1">Beginn (UTC)<input type="datetime-local" name="from" className={inputCls} required /></label>
        <label className="grid gap-1">Ende (UTC)<input type="datetime-local" name="to" className={inputCls} required /></label>
        <label className="grid gap-1">Teammitglied<select name="employee" className={inputCls}><option value="">Ganzer Standort</option>
          {staff.map((entry) => <option key={entry.id} value={entry.id}>{entry.displayName}</option>)}</select></label>
        <label className="grid gap-1">Grund<input name="reason" className={inputCls} maxLength={160} required /></label>
      </div>
      <PrimaryButton testId="add-booking-block" disabled={change.isPending}>Sperrzeit hinzufügen</PrimaryButton>
    </form>
    <ul className="space-y-2">{query.data?.blocks.map((entry) => <li key={entry.id}>
      {appointmentLabel(entry.startsAt, timezone)} – {appointmentLabel(entry.endsAt, timezone)} · {entry.reason}
      <button type="button" className="ml-3 underline" disabled={change.isPending}
        onClick={() => change.mutate({ url: `/blocks/${entry.id}`, method: 'DELETE' })}>Entfernen</button>
    </li>)}</ul>
    <form className="space-y-3" onSubmit={resource}>
      <h3 className="font-medium">Exklusive Ressource hinzufügen</h3>
      <label className="grid gap-1">Name<input name="name" className={inputCls} maxLength={100} required /></label>
      <fieldset className="space-y-1"><legend>Benötigt für</legend>
        {services.map((entry) => <label key={entry.id} className="flex gap-2"><input type="checkbox" name="service" value={entry.id} />{entry.name}</label>)}
      </fieldset>
      <PrimaryButton testId="add-booking-resource" disabled={change.isPending || !services.length}>Ressource hinzufügen</PrimaryButton>
    </form>
    <ul className="space-y-2">{query.data?.resources.map((entry) => <li key={entry.id}>
      {entry.name} · {services.filter((service) => entry.serviceIds.includes(service.id)).map((service) => service.name).join(', ')}
      <button type="button" className="ml-3 underline" disabled={change.isPending}
        onClick={() => change.mutate({ url: `/resources/${entry.id}`, method: 'DELETE' })}>Entfernen</button>
    </li>)}</ul>
    {query.isError && <button type="button" className="underline" onClick={() => query.refetch()}>Einstellungen erneut laden</button>}
    <FormStatus error={change.error ? errorText(change.error) : null} />
  </div>;
}
