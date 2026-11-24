import type { CustomerDeletionAssessment } from '@workspace/api-client-react';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Field, FormStatus, Panel, PrimaryButton, inputCls } from '@/components/forms';
import { errorText } from '@/lib/api';
import { getBookingData, sendBookingData } from '@/lib/booking';

type Customer = {
  id: string; name: string; email: string; emailVerified: boolean; activeOwnerships: number;
  deletionRequestedAt: string | null; reviewedAt: string | null; canRehearseErasure: boolean;
};
type Scope = 'all' | 'pending' | 'reviewed';
const path = '/api/admin/customers';
const dates = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' });

export default function PlatformCustomers() {
  const [term, setTerm] = useState('');
  const [filters, setFilters] = useState<{ search: string; scope: Scope; offset: number }>({ search: '', scope: 'pending', offset: 0 });
  const params = new URLSearchParams({ search: filters.search, scope: filters.scope, offset: String(filters.offset) });
  const list = useQuery({
    queryKey: [path, filters], queryFn: ({ signal }) => getBookingData<{ customers: Customer[]; hasMore: boolean }>(path + '?' + params, signal),
  });
  const [armed, setArmed] = useState<string>();
  const erase = useMutation({
    mutationFn: (customer: Customer) => sendBookingData(path + '/' + customer.id + '/test-erasure', { requestedAt: customer.deletionRequestedAt }),
    onSuccess: async () => { setArmed(undefined); setFilters((current) => ({ ...current, offset: 0 })); await list.refetch(); },
  });
  const review = useMutation({
    mutationFn: (customer: Customer) => sendBookingData(path + '/' + customer.id + '/deletion-review',
      { requestedAt: customer.deletionRequestedAt }, 'PUT'),
    onSuccess: async () => { setFilters((current) => ({ ...current, offset: 0 })); await list.refetch(); },
  });

  return <div className="mx-auto max-w-3xl space-y-4 px-5 py-10">
    <h1 className="font-display text-4xl">Kundenkonten und Löschanfragen</h1>
    <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
      event.preventDefault();
      setFilters((current) => ({ ...current, search: term.trim(), offset: 0 }));
    }}>
      <Field id="customer-lookup" label="Name oder E-Mail"><input id="customer-lookup" className={inputCls}
        value={term} maxLength={160} onChange={(event) => setTerm(event.target.value)} /></Field>
      <PrimaryButton testId="find-platform-customers" disabled={review.isPending}>Suchen</PrimaryButton>
    </form>
    <Field id="customer-scope" label="Ansicht"><select id="customer-scope" className={inputCls} value={filters.scope} disabled={review.isPending}
      onChange={(event) => setFilters({ ...filters, scope: event.target.value as Scope, offset: 0 })}>
      <option value="pending">Offene Löschanfragen</option>
      <option value="reviewed">Gesichtete Löschanfragen</option>
      <option value="all">Alle Kundenkonten</option>
    </select></Field>
    {list.isPending && <p role="status">Konten werden geladen …</p>}
    {list.isError && <button type="button" className="underline" onClick={() => list.refetch()}>Konten erneut laden</button>}
    <FormStatus error={list.error || review.error ? errorText(list.error ?? review.error) : null} />
    {erase.isSuccess && <p role="status">Lokales Testkonto gelöscht.</p>}
    <FormStatus error={erase.error ? errorText(erase.error) : null} />
    {review.isSuccess && <p role="status">Sichtung protokolliert.</p>}
    {list.data?.customers.length === 0 && <p>Keine passenden Konten gefunden.</p>}
    {list.data?.customers.map((customer) => <Panel key={customer.id} title={customer.name || 'Kundenkonto'}>
      {customer.email && <p className="break-all">{customer.email} · {customer.emailVerified ? 'Bestätigt' : 'Unbestätigt'}</p>}
      <p>Aktive Betriebsinhaberschaften · {customer.activeOwnerships}</p>
      {customer.deletionRequestedAt && <p>Löschanfrage vom {dates.format(new Date(customer.deletionRequestedAt))}</p>}
      {customer.deletionRequestedAt && <DeletionAssessment customer={customer} />}
      {customer.reviewedAt && <p>Gesichtet am {dates.format(new Date(customer.reviewedAt))}</p>}
      {customer.canRehearseErasure && <div className="mt-3 space-y-2">
        {armed === customer.id ? <>
          <p className="text-sm">Das lokale Testkonto und seine verknüpften Testdaten werden endgültig gelöscht. Das Konto beim Anmeldedienst bleibt bestehen.</p>
          <PrimaryButton type="button" variant="danger" testId={'confirm-test-erasure-' + customer.id}
            pending={erase.isPending} onClick={() => erase.mutate(customer)}>Lokales Testkonto löschen</PrimaryButton>
          <button type="button" className="ml-3 underline" disabled={erase.isPending} onClick={() => { setArmed(undefined); erase.reset(); }}>
            Abbrechen
          </button>
        </> : <button type="button" className="underline" disabled={erase.isPending}
          onClick={() => { erase.reset(); setArmed(customer.id); }}>Testlöschung vorbereiten</button>}
      </div>}
      {customer.deletionRequestedAt && !customer.reviewedAt &&
        <div className="mt-3 space-y-2">
          <p className="text-sm">Die Sichtung dokumentiert die Prüfung. Die Löschanfrage bleibt bestehen.</p>
          <PrimaryButton type="button" testId={'review-deletion-' + customer.id} disabled={review.isPending}
            onClick={() => review.mutate(customer)}>Sichtung protokollieren</PrimaryButton>
        </div>}
    </Panel>)}
    <div className="flex gap-3">
      {filters.offset > 0 && <button type="button" className="underline" disabled={review.isPending}
        onClick={() => setFilters({ ...filters, offset: filters.offset - 20 })}>Zurück</button>}
      {list.data?.hasMore && <button type="button" className="underline" disabled={review.isPending}
        onClick={() => setFilters({ ...filters, offset: filters.offset + 20 })}>Weitere Konten</button>}
    </div>
  </div>;
}

const assessmentLabels: Record<keyof CustomerDeletionAssessment, string> = {
  activeOwnerships: 'Aktive Betriebsinhaberschaften', staffProfiles: 'Personalprofile', bookings: 'Termine',
  confirmedBookings: 'Bestätigte Termine', paymentReferences: 'Zahlungsmethoden', bookingPayments: 'Terminzahlungen',
  packages: 'Pakete und Mitgliedschaften', supportCases: 'Supportfälle', businessActions: 'Protokollierte Betriebsvorgänge',
  policyAcceptances: 'Akzeptierte Buchungsbedingungen',
};

function DeletionAssessment({ customer }: { customer: Customer }) {
  const [open, setOpen] = useState(false);
  const endpoint = path + '/' + customer.id + '/deletion-assessment';
  const query = useQuery({
    queryKey: [endpoint, customer.deletionRequestedAt], enabled: open,
    queryFn: ({ signal }) => getBookingData<CustomerDeletionAssessment>(endpoint, signal),
  });
  return <details className="my-2" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer underline">Kontobezogene Datensätze prüfen</summary>
    {open && query.isPending && <p role="status">Datensätze werden ermittelt …</p>}
    <FormStatus error={query.error ? errorText(query.error) : null} />
    {query.data && <dl className="my-2 grid grid-cols-[1fr_auto] gap-x-4 text-sm">
      {(Object.keys(assessmentLabels) as (keyof CustomerDeletionAssessment)[]).map((key) => <div className="contents" key={key}>
        <dt>{assessmentLabels[key]}</dt><dd className="tabular-nums">{query.data[key]}</dd>
      </div>)}
    </dl>}
  </details>;
}
