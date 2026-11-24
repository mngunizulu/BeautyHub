import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BusinessWorkspace, OrganizationAnalytics } from '@workspace/api-client-react';
import { Field, FormStatus, Panel, inputCls } from '@/components/forms';
import { errorText } from '@/lib/api';
import { dateInZone, getBookingData } from '@/lib/booking';
import { formatCents } from '@/lib/format';

type LocationMetrics = OrganizationAnalytics['locations'][number];
const number = new Intl.NumberFormat('de-DE');
const cell = 'px-3 py-2 tabular-nums';

export function BusinessAnalytics({ workspace }: { workspace: BusinessWorkspace }) {
  const [filters, setFilters] = useState(() => {
    const to = dateInZone('Europe/Berlin');
    return { from: to.slice(0, 7) + '-01', to, locationId: '' };
  });
  const params = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.locationId) params.set('locationId', filters.locationId);
  const path = '/api/organizations/' + workspace.id + '/analytics?' + params;
  const days = (Date.parse(filters.to) - Date.parse(filters.from)) / 86400000;
  const valid = Number.isFinite(days) && days >= 0 && days < 366;
  const report = useQuery({
    queryKey: ['business-analytics', path], enabled: valid,
    queryFn: ({ signal }) => getBookingData<OrganizationAnalytics>(path, signal),
  });
  const data = report.data;
  const total = (key: keyof Omit<LocationMetrics, 'id' | 'name'>) =>
    data?.locations.reduce((sum, location) => sum + location[key], 0) ?? 0;

  return <div className="space-y-6">
    <Panel title="Geschäftsberichte">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="report-from" label="Von"><input id="report-from" type="date" className={inputCls}
          value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></Field>
        <Field id="report-to" label="Bis"><input id="report-to" type="date" className={inputCls}
          value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></Field>
        <Field id="report-location" label="Standort"><select id="report-location" className={inputCls}
          value={filters.locationId} onChange={(event) => setFilters({ ...filters, locationId: event.target.value })}>
          <option value="">Alle Standorte</option>
          {workspace.locations.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select></Field>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">Termine zählen nach ihrem Startdatum. Zahlungen und Erstattungen zählen nach dem Erfassungsdatum, einschließlich simulierter Zahlungen.</p>
      <FormStatus error={valid ? report.error ? errorText(report.error) : null : 'Wähle einen Zeitraum von höchstens 366 Tagen.'} />
      {valid && report.isPending && <p role="status" className="mt-4">Bericht wird geladen …</p>}
      {report.isError && <button type="button" className="underline" onClick={() => report.refetch()}>Bericht erneut laden</button>}
      {data && <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div><dt>Termine</dt><dd className="font-semibold">{number.format(total('bookings'))}</dd></div>
        <div><dt>Abgeschlossen</dt><dd className="font-semibold">{number.format(total('completed'))}</dd></div>
        <div><dt>Zahlungseingänge</dt><dd className="font-semibold">{formatCents(total('receivedCents'))}</dd></div>
        <div><dt>Netto nach Erstattungen</dt><dd className="font-semibold">{formatCents(total('receivedCents') - total('refundedCents'))}</dd></div>
      </dl>}
    </Panel>
    {data && <>
      <Panel title="Standorte">
        {data.locations.length === 0 ? <p>Es sind noch keine Standorte eingerichtet.</p> : <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead><tr className="border-b border-border">
              {['Standort', 'Termine', 'Abgeschlossen', 'Storniert', 'Nicht erschienen', 'Eingänge', 'Erstattungen', 'Netto'].map((label) =>
                <th scope="col" className={cell} key={label}>{label}</th>)}
            </tr></thead>
            <tbody>{data.locations.map((row) => <tr className="border-b border-border" key={row.id}>
              <th scope="row" className={cell}>{row.name}</th>
              {[row.bookings, row.completed, row.cancelled, row.noShows].map((value, index) => <td className={cell} key={index}>{number.format(value)}</td>)}
              <td className={cell}>{formatCents(row.receivedCents)}</td><td className={cell}>{formatCents(row.refundedCents)}</td>
              <td className={cell}>{formatCents(row.receivedCents - row.refundedCents)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </Panel>
      <Panel title="Mitarbeitende">
        {data.staff.length ? <ul className="space-y-2">{data.staff.map((row) => <li key={row.id}>
          <strong>{row.name}</strong> · {number.format(row.completed)} abgeschlossene Termine · {number.format(row.minutes)} Leistungsminuten
          {' · '}{formatCents(row.receivedCents - row.refundedCents)} netto
        </li>)}</ul> : <p>Keine abgeschlossenen Termine im gewählten Zeitraum.</p>}
      </Panel>
      <Panel title="Leistungen">
        <p className="mb-2 text-sm text-muted-foreground">Bei mehreren Leistungen werden Terminzahlungen und Erstattungen nach den gebuchten Einzelpreisen aufgeteilt.</p>
        {data.services.length ? <ul className="space-y-2">{data.services.map((row) => <li key={row.id}>
          <strong>{row.name}</strong> · {number.format(row.completed)} erbrachte Leistungen · {formatCents(row.receivedCents - row.refundedCents)} netto
        </li>)}</ul> : <p>Keine erbrachten Leistungen oder Terminzahlungen im gewählten Zeitraum.</p>}
      </Panel>
      <Panel title="Neue und wiederkehrende Kunden">
        <p>{number.format(data.customers.new)} neu · {number.format(data.customers.repeat)} wiederkehrend</p>
        <p className="mt-2 text-sm text-muted-foreground">Gezählt werden Kundenkonten mit abgeschlossenem Termin. Der erste abgeschlossene Termin im Betrieb entscheidet über die Zuordnung.</p>
      </Panel>
      <Panel title="Kapazitätsauslastung">
        <p className="mb-2 text-sm text-muted-foreground">Die Auswertung verwendet aktuelle Öffnungs- und Arbeitszeiten abzüglich Pausen und Sperrzeiten. Als belegt zählen bestätigte und abgeschlossene Termine innerhalb dieser Zeiten.</p>
        <ul className="space-y-2">{data.locations.map((row) => <li key={row.id}>
          <strong>{row.name}</strong> · {row.capacityMinutes > 0
            ? <>{number.format(row.occupiedMinutes)} von {number.format(row.capacityMinutes)} Min. belegt
              {' · '}{new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 1 })
                .format(row.occupiedMinutes / row.capacityMinutes)}</>
            : 'Keine geplante Kapazität'}
        </li>)}</ul>
      </Panel>
      <Panel title="Aktueller Lagerbestand">
        <ul className="space-y-2">{data.locations.map((row) => <li key={row.id}>
          <strong>{row.name}</strong> · {number.format(row.units)} Einheiten · {number.format(row.lowStock)} Artikel mit niedrigem Bestand
          {' · '}{formatCents(row.inventoryValueCents)} geschätzter Warenwert · {number.format(row.unpricedUnits)} Einheiten ohne Einkaufspreis
        </li>)}</ul>
      </Panel>
      <Panel title="Marketing für den gesamten Betrieb">
        <p>{number.format(data.marketing.captures)} lokale Kampagnenaufzeichnungen · {number.format(data.marketing.recipients)} erfasste Kontakte</p>
      </Panel>
    </>}
  </div>;
}
