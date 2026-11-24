import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Field, FormStatus, Panel, PrimaryButton, inputCls } from '@/components/forms';
import { errorText } from '@/lib/api';
import { getBookingData, sendBookingData } from '@/lib/booking';
import { formatCents } from '@/lib/format';

type Kind = 'package' | 'membership';
const kindName = { package: 'Paket', membership: 'Mitgliedschaft' };
type Terms = { kind: Kind; id: string; name: string; visits: number; priceCents: number; validDays: number };
type ManagedOffer = Terms & { serviceId: string; active: boolean };
type Offer = Terms & { business: string; service: string };
type Purchase = { kind: Kind; id: string; name: string; service: string; business: string; remaining: number; expiresAt: string; priceCents: number };
const account = '/api/me/service-packages';
const dates = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'Europe/Berlin' });

export function CustomerPackages() {
  const [requests, setRequests] = useState<Record<string, string>>({});
  const offers = useQuery({ queryKey: [account, 'offers'], queryFn: ({ signal }) => getBookingData<Offer[]>(account + '/offers', signal) });
  const purchases = useQuery({ queryKey: [account], queryFn: ({ signal }) => getBookingData<Purchase[]>(account, signal) });
  const buy = useMutation({
    mutationFn: ({ offer, requestId }: { offer: Offer; requestId: string }) =>
      sendBookingData(account + '/offers/' + offer.id, { requestId, expectedPriceCents: offer.priceCents }),
    onSuccess: async (_, { offer }) => {
      await purchases.refetch();
      setRequests((current) => ({ ...current, [offer.id]: crypto.randomUUID() }));
    },
  });
  return <Panel title="Terminpakete und Mitgliedschaften">
    {purchases.isPending && <p role="status">Terminpakete werden geladen …</p>}
    {purchases.isError && <button type="button" className="underline" onClick={() => purchases.refetch()}>Pakete erneut laden</button>}
    {!!purchases.data?.length && <ul className="space-y-2">
      {purchases.data.map((pack) => <li key={pack.id}>
        <p className="font-medium">{pack.business} · {pack.name} · {kindName[pack.kind]}</p>
        <p className="text-sm">{pack.service} · {pack.remaining} Termine übrig · gültig bis {dates.format(new Date(pack.expiresAt))}</p>
      </li>)}
    </ul>}
    {!!offers.data?.length && <div className="mt-4 space-y-2">
      <h3 className="font-semibold">Verfügbare Pakete</h3>
      <p className="text-sm">Käufe sind simuliert. Der Betrieb kann einen Inklusivtermin bei der Abrechnung anwenden. Befristete Mitgliedschaften verlängern sich nicht automatisch.</p>
      <ul className="space-y-3">{offers.data.map((offer) => <li key={offer.id} className="space-y-1">
        <p className="font-medium">{offer.business} · {offer.name} · {kindName[offer.kind]}</p>
        <p className="text-sm">{offer.service} · {offer.visits} Termine · {offer.validDays} Tage · {formatCents(offer.priceCents)}</p>
        <PrimaryButton type="button" testId={'buy-service-package-' + offer.id} disabled={buy.isPending} onClick={() => {
          const requestId = requests[offer.id] ?? crypto.randomUUID();
          setRequests((current) => ({ ...current, [offer.id]: requestId }));
          buy.mutate({ offer, requestId });
        }}>Paketkauf simulieren</PrimaryButton>
      </li>)}</ul>
    </div>}
    {offers.data?.length === 0 && purchases.data?.length === 0 && <p>Derzeit sind keine Terminpakete verfügbar.</p>}
    {offers.isError && <button type="button" className="underline" onClick={() => offers.refetch()}>Angebote erneut laden</button>}
    {buy.isSuccess && <p role="status">Paket zum Konto hinzugefügt.</p>}
    <FormStatus error={buy.error ? errorText(buy.error) : null} />
  </Panel>;
}

export function BusinessPackages({ organizationId, services }: { organizationId: string; services: { id: string; name: string; archived: boolean }[] }) {
  const path = '/api/organizations/' + organizationId + '/service-packages';
  const offers = useQuery({ queryKey: [path], queryFn: ({ signal }) => getBookingData<ManagedOffer[]>(path, signal) });
  const [draft, setDraft] = useState({ kind: 'package' as Kind, name: '', serviceId: '', visits: '2', price: '', validDays: '90' });
  const create = useMutation({
    mutationFn: () => sendBookingData(path, { kind: draft.kind, name: draft.name, serviceId: draft.serviceId,
      visits: Number(draft.visits), priceCents: Math.round(Number(draft.price.replace(',', '.')) * 100), validDays: Number(draft.validDays) }),
    onSuccess: async () => { await offers.refetch(); setDraft((current) => ({ ...current, name: '', price: '' })); },
  });
  const toggle = useMutation({
    mutationFn: (offer: ManagedOffer) => sendBookingData(path + '/' + offer.id, { active: !offer.active }, 'PUT'),
    onSuccess: () => offers.refetch(),
  });
  return <Panel title="Terminpakete und Mitgliedschaften">
    {offers.isError && <button type="button" className="underline" onClick={() => offers.refetch()}>Pakete erneut laden</button>}
    <ul className="space-y-2">{offers.data?.map((offer) => <li key={offer.id} className="flex flex-wrap justify-between gap-2">
      <p>{offer.name} · {kindName[offer.kind]} · {offer.visits} Termine · {formatCents(offer.priceCents)} · {offer.active ? 'Aktiv' : 'Pausiert'}</p>
      <button type="button" disabled={toggle.isPending} className="underline" onClick={() => toggle.mutate(offer)}>
        {offer.active ? 'Paket pausieren' : 'Paket aktivieren'}</button>
    </li>)}</ul>
    {services.some((service) => !service.archived) && <form className="mt-4 space-y-2" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
      <fieldset disabled={create.isPending} className="space-y-2">
        <Field id="package-kind" label="Angebotstyp"><select id="package-kind" className={inputCls} value={draft.kind}
          onChange={(event) => setDraft({ ...draft, kind: event.target.value as Kind })}>
          <option value="package">Terminpaket</option>
          <option value="membership">Befristete Mitgliedschaft</option>
        </select></Field>
        <Field id="package-name" label="Paketname"><input id="package-name" className={inputCls} required maxLength={120}
          value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
        <Field id="package-service" label="Enthaltene Leistung"><select id="package-service" className={inputCls} required
          value={draft.serviceId} onChange={(event) => setDraft({ ...draft, serviceId: event.target.value })}>
          <option value="">Bitte auswählen</option>
          {services.filter((service) => !service.archived).map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
        </select></Field>
        <Field id="package-visits" label="Anzahl Termine"><input id="package-visits" className={inputCls} type="number" required min={2} max={50}
          value={draft.visits} onChange={(event) => setDraft({ ...draft, visits: event.target.value })} /></Field>
        <Field id="package-price" label="Paketpreis (EUR)"><input id="package-price" className={inputCls} type="number" required min="0.01" max="100000" step="0.01"
          value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} /></Field>
        <Field id="package-valid-days" label="Gültigkeit in Tagen"><input id="package-valid-days" className={inputCls} type="number" required min={1} max={730}
          value={draft.validDays} onChange={(event) => setDraft({ ...draft, validDays: event.target.value })} /></Field>
        <PrimaryButton testId="create-service-package" pending={create.isPending}>Paket erstellen</PrimaryButton>
      </fieldset>
    </form>}
    <FormStatus error={create.error || toggle.error ? errorText(create.error ?? toggle.error) : null} />
  </Panel>;
}
