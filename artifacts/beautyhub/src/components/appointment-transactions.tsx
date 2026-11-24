import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AppointmentTransactionReport, BusinessWorkspace } from '@workspace/api-client-react';
import { RetailReceipt, RetailRefund } from '@/components/retail-checkout';
import { Field, Panel, inputCls } from '@/components/forms';
import { appointmentLabel, dateInZone, getBookingData } from '@/lib/booking';
import { formatCents } from '@/lib/format';

const methods = { cash: 'Bar', simulated_card: 'Simulierte Kartenzahlung' };
const kinds = { deposit: 'Anzahlung', settlement: 'Restzahlung', refund: 'Erstattung', retail: 'Warenverkauf', retail_refund: 'Verkaufserstattung' };
type Method = keyof typeof methods;
export function AppointmentTransactions({ workspace }: { workspace: BusinessWorkspace }) {
  const [locationId, setLocationId] = useState(workspace.locations[0]?.id ?? '');
  const location = workspace.locations.find(({ id }) => id === locationId) ?? workspace.locations[0];
  if (!location) return null;
  return <Panel title="Tagesumsätze">
    <Field id="transaction-location" label="Standort">
      <select id="transaction-location" className={inputCls} value={location.id} onChange={(event) => setLocationId(event.target.value)}>
        {workspace.locations.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      </select>
    </Field>
    <DailyReport key={location.id} organizationId={workspace.id} location={location} />
  </Panel>;
}

function DailyReport({ organizationId, location }: {
  organizationId: string; location: BusinessWorkspace['locations'][number];
}) {
  const [date, setDate] = useState(() => dateInZone(location.timezone));
  const [page, setPage] = useState(0);
  const [countedCash, setCountedCash] = useState('');
  const query = useQuery({
    queryKey: ['appointment-transactions', organizationId, location.id, date, page],
    queryFn: ({ signal }) => getBookingData<AppointmentTransactionReport>(
      '/api/organizations/' + organizationId + '/locations/' + location.id + '/appointment-transactions?' +
      new URLSearchParams({ date, page: String(page) }), signal),
  });
  const report = query.data;
  const countedCents = /^-?\d{1,8}([.,]\d{1,2})?$/.test(countedCash) ? Math.round(Number(countedCash.replace(',', '.')) * 100) : null;
  const cash = report?.totals.find(({ method }) => method === 'cash');
  const netCash = (cash?.receivedCents ?? 0) - (cash?.refundedCents ?? 0);
  return <div className="mt-4 space-y-4">
    <Field id="transaction-date" label="Buchungstag der Zahlung">
      <input id="transaction-date" className={inputCls} type="date" value={date}
        onChange={(event) => { if (event.target.value) { setDate(event.target.value); setPage(0); setCountedCash(''); } }} />
    </Field>
    {query.isPending && <p role="status">Zahlungen werden geladen …</p>}
    {query.isError && <button type="button" className="underline" onClick={() => query.refetch()}>Tagesumsätze erneut laden</button>}
    {report && <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr><th>Zahlungsart</th><th>Eingänge</th><th>Erstattungen</th><th>Rabatte</th><th>Netto</th></tr></thead>
          <tbody>{(Object.keys(methods) as Method[]).map((method) => {
            const totals = report.totals.find((entry) => entry.method === method);
            const received = totals?.receivedCents ?? 0;
            const refunded = totals?.refundedCents ?? 0;
            return <tr key={method} className="border-t border-border">
              <th scope="row" className="py-2 pr-3 font-medium">{methods[method]}</th>
              <td>{formatCents(received)}</td><td>{formatCents(refunded)}</td><td>{formatCents(totals?.discountCents ?? 0)}</td><td>{formatCents(received - refunded)}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <Field id="counted-cash" label="Gezählte Barbewegung (EUR, ohne Wechselgeldbestand)">
        <input id="counted-cash" className={inputCls} inputMode="decimal" value={countedCash} onChange={(event) => setCountedCash(event.target.value)} />
      </Field>
      {countedCents !== null && <p role="status">Abweichung {formatCents(countedCents - netCash)}</p>}
      {!report.count && <p>Keine Zahlungsvorgänge an diesem Tag.</p>}
      {report.count > 0 && <ul className="divide-y divide-border text-sm" aria-label="Zahlungsvorgänge">
        {report.entries.map((entry) => <li key={entry.kind + entry.id} className="flex flex-wrap justify-between gap-2 py-2">
          <span>{appointmentLabel(entry.recordedAt, report.timezone)} · {kinds[entry.kind]} · {methods[entry.method]} · {entry.bookingId ? "Termin " + entry.bookingId.slice(0, 8) : "Verkauf " + entry.paymentId.slice(0, 8)}</span>
          {entry.kind === 'retail' && <div className="space-y-2">
            <RetailReceipt path={'/api/organizations/' + organizationId + '/locations/' + location.id + '/retail-sales'} saleId={entry.id} />
            <RetailRefund path={'/api/organizations/' + organizationId + '/locations/' + location.id + '/retail-sales'} saleId={entry.id} />
          </div>}
          <strong>{formatCents(entry.kind === 'refund' || entry.kind === 'retail_refund' ? -entry.amountCents : entry.amountCents)}</strong>
        </li>)}
      </ul>}
      <div className="flex gap-4 text-sm">
        {page > 0 && <button type="button" className="underline" onClick={() => setPage(page - 1)}>Vorherige Seite</button>}
        {(page + 1) * 50 < report.count && <button type="button" className="underline" onClick={() => setPage(page + 1)}>Weitere Zahlungsvorgänge</button>}
      </div>
    </>}
  </div>;
}
