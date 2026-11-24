import { customFetch } from '@workspace/api-client-react';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Field, FormStatus, Panel, PrimaryButton, inputCls } from '@/components/forms';
import { errorText } from '@/lib/api';
import { appointmentLabel, getBookingData, sendBookingData, statusLabel, type Booking } from '@/lib/booking';

type Customer = {
  id: string; revision: number; name: string; email: string; phone: string; notes: string;
  contactPreference: 'none' | 'email' | 'phone'; tags: string[]; completedVisits?: number;
};
type Visit = Pick<Booking, 'startsAt' | 'status' | 'salon' | 'timezone' | 'items'> & { bookingId: string; name?: string };

export function PrivateCrm({ organizationId }: { organizationId: string }) {
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [minVisits, setMinVisits] = useState('');
  const [selected, setSelected] = useState<Customer | 'new'>();
  const path = `/api/organizations/${organizationId}/crm-customers`;
  const params = new URLSearchParams({ q, tag });
  if (/^\d{1,4}$/.test(minVisits)) params.set('minVisits', minVisits);
  const list = useQuery({ queryKey: [path, q, tag, minVisits], queryFn: ({ signal }) => getBookingData<Customer[]>(`${path}?${params}`, signal) });
  return <div className="space-y-6">
    <Panel title="Private Kundenkartei">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="crm-search" label="Name, E-Mail oder Telefon">
          <input id="crm-search" type="search" className={inputCls} maxLength={100} value={q} onChange={(event) => setQ(event.target.value)} />
        </Field>
        <Field id="crm-tag" label="Schlagwort filtern">
          <input id="crm-tag" className={inputCls} maxLength={40} value={tag} onChange={(event) => setTag(event.target.value)} />
        </Field>
        <Field id="crm-min-visits" label="Mindestanzahl abgeschlossener Besuche">
          <input id="crm-min-visits" type="number" min={0} max={9999} step={1} className={inputCls} value={minVisits}
            onChange={(event) => setMinVisits(event.target.value)} />
        </Field>
      </div>
      <button type="button" className="mt-4 underline" onClick={() => setSelected('new')}>Kundenprofil anlegen</button>
      {list.isPending ? <p role="status">Kunden werden geladen …</p>
        : list.isError ? <button type="button" className="ml-3 underline" onClick={() => list.refetch()}>Erneut laden</button>
        : !list.data.length ? <p className="mt-3">Keine passenden Kundenprofile.</p>
        : <ul className="mt-3 divide-y divide-border">{list.data.map((customer) => <li key={customer.id} className="py-2">
          <button type="button" className="underline" onClick={() => setSelected(customer)}>{customer.name}</button>
          <span className="ml-3 text-sm text-muted-foreground">{customer.completedVisits ?? 0} abgeschlossene Besuche</span>
          {!!customer.tags.length && <span className="ml-3 text-sm text-muted-foreground">{customer.tags.join(', ')}</span>}
        </li>)}</ul>}
    </Panel>
    {selected && <CustomerEditor key={selected === 'new' ? 'new' : `${selected.id}/${selected.revision}`}
      path={path} customer={selected === 'new' ? undefined : selected} onSave={setSelected} />}
  </div>;
}

function CustomerEditor({ path, customer, onSave }: { path: string; customer?: Customer; onSave: (value: Customer) => void }) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (data: Record<string, unknown>) => sendBookingData<Customer>(customer ? `${path}/${customer.id}` : path,
      { ...data, ...(customer ? { revision: customer.revision } : {}) }, customer ? 'PUT' : 'POST'),
    onSuccess: (value) => { onSave(value); return qc.invalidateQueries({ queryKey: [path] }); },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    save.mutate({
      name: fields.get('name'), email: fields.get('email'), phone: fields.get('phone'), notes: fields.get('notes'),
      contactPreference: fields.get('contactPreference'),
      tags: String(fields.get('tags')).split(',').map((tag) => tag.trim()).filter(Boolean),
    });
  };
  return <Panel title={customer ? `Kundenprofil · ${customer.name}` : 'Neues Kundenprofil'}>
    <form className="space-y-3" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="crm-name" label="Name"><input id="crm-name" name="name" className={inputCls} maxLength={100} defaultValue={customer?.name} required /></Field>
        <Field id="crm-email" label="E-Mail"><input id="crm-email" type="email" name="email" className={inputCls} defaultValue={customer?.email} maxLength={254} /></Field>
        <Field id="crm-phone" label="Telefon"><input id="crm-phone" type="tel" name="phone" className={inputCls} defaultValue={customer?.phone} maxLength={50} /></Field>
        <Field id="crm-contact" label="Bevorzugter Kontakt">
          <select id="crm-contact" name="contactPreference" className={inputCls} defaultValue={customer?.contactPreference ?? 'none'}>
            <option value="none">Keine Angabe</option><option value="email">E-Mail</option><option value="phone">Telefon</option>
          </select>
        </Field>
      </div>
      <Field id="crm-tags" label="Schlagwörter (mit Komma trennen)">
        <input id="crm-tags" name="tags" className={inputCls} defaultValue={customer?.tags.join(', ')} maxLength={840} />
      </Field>
      <Field id="crm-notes" label="Private Notizen und Wünsche">
        <textarea id="crm-notes" name="notes" className={inputCls} rows={4} maxLength={8000} defaultValue={customer?.notes} />
      </Field>
      <PrimaryButton testId="save-crm-customer" pending={save.isPending} disabled={save.isPending}>Kundenprofil speichern</PrimaryButton>
      <FormStatus error={save.error ? errorText(save.error) : null} />
    </form>
    {customer && <>
      <VisitHistory key={customer.id} path={`${path}/${customer.id}/appointments`} />
      <CustomerAttachments path={`${path}/${customer.id}/attachments`} />
    </>}
  </Panel>;
}

function VisitHistory({ path }: { path: string }) {
  const [bookingId, setBookingId] = useState('');
  const qc = useQueryClient();
  const history = useQuery({
    queryKey: [path],
    queryFn: ({ signal }) => getBookingData<{ history: Visit[]; candidates: Visit[] }>(path, signal),
  });
  const change = useMutation({
    mutationFn: ({ id, method }: { id: string; method: 'PUT' | 'DELETE' }) => sendBookingData(`${path}/${id}`, undefined, method),
    onSuccess: () => { setBookingId(''); return qc.invalidateQueries({ queryKey: [path] }); },
  });
  return <section className="mt-6 space-y-3 border-t border-border pt-4" aria-labelledby="crm-history">
    <h3 className="font-medium" id="crm-history">Terminhistorie</h3>
    {history.isPending ? <p role="status">Termine werden geladen …</p>
      : history.isError ? <button type="button" className="underline" onClick={() => history.refetch()}>Termine erneut laden</button>
      : <>
        <ul className="space-y-2">{history.data.history.map((entry) => <li key={entry.bookingId}>
          {appointmentLabel(entry.startsAt, entry.timezone)} · {entry.salon} · {entry.items.map((item) => item.name).join(', ')} · {statusLabel[entry.status]}
          <button type="button" className="ml-3 underline" disabled={change.isPending}
            onClick={() => change.mutate({ id: entry.bookingId, method: 'DELETE' })}>Zuordnung lösen</button>
        </li>)}</ul>
        {!history.data.history.length && <p>Keine zugeordneten Termine.</p>}
        {!!history.data.candidates.length && <>
          <Field id="crm-appointment" label="Vorhandenen Termin zuordnen">
            <select id="crm-appointment" className={inputCls} value={bookingId} onChange={(event) => setBookingId(event.target.value)}>
              <option value="">Termin auswählen</option>
              {history.data.candidates.map((entry) => <option key={entry.bookingId} value={entry.bookingId}>
                {appointmentLabel(entry.startsAt, entry.timezone)} · {entry.name} · {entry.salon}
              </option>)}
            </select>
          </Field>
          <PrimaryButton type="button" testId="link-crm-appointment" disabled={!bookingId || change.isPending}
            onClick={() => change.mutate({ id: bookingId, method: 'PUT' })}>Termin zuordnen</PrimaryButton>
        </>}
      </>}
    <FormStatus error={change.error ? errorText(change.error) : null} />
  </section>;
}

function CustomerAttachments({ path }: { path: string }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: [path], queryFn: ({ signal }) =>
    getBookingData<{ id: string; name: string }[]>(path, signal) });
  const [validation, setValidation] = useState('');
  const upload = useMutation({
    mutationFn: (file: File) => customFetch(path, { method: 'POST', body: file,
      headers: { 'Content-Type': 'application/pdf', 'X-Attachment-Name': encodeURIComponent(file.name) } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [path] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => sendBookingData(`${path}/${id}`, undefined, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: [path] }),
  });
  const download = useMutation({
    mutationFn: async (entry: { id: string; name: string }) => {
      const blob = await customFetch<Blob>(`${path}/${entry.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = entry.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidation('');
    const form = event.currentTarget;
    const file = new FormData(form).get('pdf');
    if (!(file instanceof File) || file.type !== 'application/pdf' || !file.size || file.size > 768 * 1024) {
      setValidation('Bitte eine PDF-Datei bis 768 KiB auswählen.');
      return;
    }
    upload.mutate(file, { onSuccess: () => form.reset() });
  };
  const error = upload.error ?? remove.error ?? download.error;
  return <section className="mt-6 space-y-3 border-t border-border pt-4" aria-labelledby="crm-files-heading">
    <h3 id="crm-files-heading" className="font-medium">Private Dokumente</h3>
    {list.isError && <button type="button" className="underline" onClick={() => list.refetch()}>Dokumente erneut laden</button>}
    <form className="space-y-2" onSubmit={submit}>
      <Field id="crm-file" label="PDF-Dokument (bis 768 KiB)">
        <input id="crm-file" className={inputCls} name="pdf" type="file" accept="application/pdf" required />
      </Field>
      <PrimaryButton testId="crm-upload" pending={upload.isPending} disabled={upload.isPending || (list.data?.length ?? 0) >= 8}>Dokument hochladen</PrimaryButton>
    </form>
    <ul className="space-y-2">{list.data?.map((entry) => <li className="flex flex-wrap gap-3" key={entry.id}>
      <button type="button" className="break-all underline" disabled={download.isPending} onClick={() => download.mutate(entry)}>{entry.name}</button>
      <button type="button" className="underline" disabled={remove.isPending}
        onClick={() => { if (window.confirm('Dokument wirklich entfernen?')) remove.mutate(entry.id); }}>Entfernen</button>
    </li>)}</ul>
    <FormStatus error={validation || (error ? errorText(error) : null)} />
  </section>;
}
