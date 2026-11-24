import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Field, FormStatus, Panel, PrimaryButton, inputCls } from '@/components/forms';
import { getBookingData, sendBookingData } from '@/lib/booking';
import { errorText } from '@/lib/api';

type Business = { id: string; name: string; verifiedAt: string | null; suspendedAt: string | null; locationCount: number };
type Action = 'verify' | 'unverify' | 'suspend' | 'reactivate';
const actions = { verify: 'Verifizieren', unverify: 'Verifizierung entfernen', suspend: 'Sperren', reactivate: 'Reaktivieren' };
const path = '/api/admin/businesses';

export default function PlatformBusinesses() {
  const [draft, setDraft] = useState('');
  const [criteria, setCriteria] = useState({ search: '', offset: 0 });
  const [selection, setSelection] = useState<{ id: string; action: Action }>();
  const query = useQuery({
    queryKey: [path, criteria],
    queryFn: ({ signal }) => getBookingData<{ businesses: Business[]; hasMore: boolean }>(
      path + '?' + new URLSearchParams({ search: criteria.search, offset: String(criteria.offset) }), signal),
  });
  const save = useMutation({
    mutationFn: ({ id, action }: NonNullable<typeof selection>) => sendBookingData(path + '/' + id, { action }, 'PUT'),
    onSuccess: async () => { await query.refetch(); setSelection(undefined); },
  });
  const select = (id: string, action: Action) => { save.reset(); setSelection({ id, action }); };
  return <div className="mx-auto max-w-3xl space-y-4 px-5 py-10">
    <h1 className="font-display text-4xl">Betriebe verwalten</h1>
    <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
      event.preventDefault();
      setSelection(undefined);
      setCriteria({ search: draft.trim(), offset: 0 });
    }}>
      <Field id="business-search" label="Betriebsname"><input id="business-search" className={inputCls}
        value={draft} maxLength={120} onChange={(event) => setDraft(event.target.value)} /></Field>
      <PrimaryButton testId="search-platform-business" disabled={save.isPending}>Suchen</PrimaryButton>
    </form>
    {query.isPending && <p role="status">Betriebe werden geladen …</p>}
    <FormStatus error={query.error || save.error ? errorText(query.error ?? save.error) : null} />
    {query.data?.businesses.length === 0 && <p>Keine passenden Betriebe gefunden.</p>}
    {query.data?.businesses.map((business) => <Panel key={business.id} title={business.name}>
      <p>{business.locationCount} Standorte · {business.verifiedAt ? 'Verifiziert' : 'Unverifiziert'} · {business.suspendedAt ? 'Gesperrt' : 'Aktiv'}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {[business.verifiedAt ? 'unverify' : 'verify', business.suspendedAt ? 'reactivate' : 'suspend'].map((value) => {
          const action = value as Action;
          return <PrimaryButton key={action} type="button" testId={action + '-business-' + business.id} variant="ghost"
            disabled={save.isPending} onClick={() => select(business.id, action)}>{actions[action]}</PrimaryButton>;
        })}
      </div>
      {selection?.id === business.id && <div className="mt-3 space-y-2 rounded-xl border p-3">
        <p>{actions[selection.action]} für {business.name} bestätigen.</p>
        {selection.action === 'suspend' && <p>Öffentliche Profile, Online-Buchungen und Paketangebote werden gesperrt.</p>}
        <div className="flex flex-wrap gap-3">
          <PrimaryButton type="button" testId="confirm-platform-business" pending={save.isPending}
            onClick={() => save.mutate(selection)}>Bestätigen</PrimaryButton>
          <button type="button" disabled={save.isPending} className="underline"
            onClick={() => { setSelection(undefined); save.reset(); }}>Abbrechen</button>
        </div>
      </div>}
    </Panel>)}
    <div className="flex gap-3">
      {criteria.offset > 0 && <button type="button" className="underline" disabled={save.isPending}
        onClick={() => { setSelection(undefined); setCriteria({ ...criteria, offset: criteria.offset - 20 }); }}>Zurück</button>}
      {query.data?.hasMore && <button type="button" className="underline" disabled={save.isPending}
        onClick={() => { setSelection(undefined); setCriteria({ ...criteria, offset: criteria.offset + 20 }); }}>Weitere Betriebe</button>}
    </div>
  </div>;
}
