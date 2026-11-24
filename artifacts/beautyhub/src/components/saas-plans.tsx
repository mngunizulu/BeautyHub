import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Field, FormStatus, Panel, PrimaryButton, inputCls } from '@/components/forms';
import { errorText } from '@/lib/api';
import { getBookingData, sendBookingData } from '@/lib/booking';
import { formatCents } from '@/lib/format';

type Plan = { code: 'starter' | 'professional' | 'enterprise'; name: string; monthlyCents: number; locationLimit: number; trialDays: number };
type State = 'trial' | 'active' | 'expired' | 'cancelled';
type Change = { action: 'activate'; planCode: Plan['code']; expectedCents: number } | { action: 'cancel' };
type View = {
  plans: Plan[]; current: { state: State; planCode: Plan['code']; periodEndsAt: string } | null; locationCount: number;
  history: { requestId: string; planCode: Plan['code']; action: Change['action'] | 'trial'; amountCents: number; createdAt: string }[];
};
const states = { trial: 'Testphase', active: 'Aktiv', expired: 'Abgelaufen', cancelled: 'Gekündigt' };
const labels = { trial: 'Testphase gestartet', activate: 'Tarif aktiviert', cancel: 'Tarif gekündigt' };
const date = (value: string) => new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'Europe/Berlin' }).format(new Date(value));

export function BusinessSaasPlan({ organizationId }: { organizationId: string }) {
  const path = '/api/organizations/' + organizationId + '/saas';
  const query = useQuery({ queryKey: [path], queryFn: ({ signal }) => getBookingData<View>(path, signal) });
  const [selection, setSelection] = useState<{ change: Change; requestId: string }>();
  const save = useMutation({
    mutationFn: (request: NonNullable<typeof selection>) =>
      sendBookingData(path + '/changes', { ...request.change, requestId: request.requestId }),
    onSuccess: async () => { await query.refetch(); setSelection(undefined); },
  });
  const view = query.data;
  const current = view?.current;
  const plan = view?.plans.find(({ code }) => code === current?.planCode);
  const choose = (change: Change) => { save.reset(); setSelection({ change, requestId: crypto.randomUUID() }); };
  return <Panel title="BeautyHub-Geschäftstarif">
    {query.isPending && <p role="status">Tarife werden geladen …</p>}
    {query.isError && <button type="button" className="underline" onClick={() => query.refetch()}>Tarife erneut laden</button>}
    {view && <>
      <p>{current ? [plan?.name ?? current.planCode, states[current.state], date(current.periodEndsAt)].join(' · ')
        : 'Bestandsbetrieb ohne aktiven Tarif'}</p>
      <p className="text-sm">{view.locationCount} Standorte eingerichtet</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {view.plans.map((offer) => <div key={offer.code} className="space-y-2 rounded-xl border p-3">
          <p className="font-semibold">{offer.name}</p>
          <p>{formatCents(offer.monthlyCents)} / 30 Tage</p>
          <p>Bis zu {offer.locationLimit} Standorte</p>
          <PrimaryButton type="button" variant="ghost" testId={'select-saas-' + offer.code}
            disabled={save.isPending || (current?.state === 'active' && current.planCode === offer.code)}
            onClick={() => choose({ action: 'activate', planCode: offer.code, expectedCents: offer.monthlyCents })}>Tarif wählen</PrimaryButton>
        </div>)}
      </div>
      {current && current.state !== 'cancelled' && <button type="button" className="mt-4 underline" disabled={save.isPending}
        onClick={() => choose({ action: 'cancel' })}>Tarif kündigen</button>}
      {selection && <div className="mt-4 space-y-2 rounded-xl border p-3">
        <p>{selection.change.action === 'cancel'
          ? 'Die Kündigung gilt sofort. Bestehende Standorte bleiben erhalten.'
          : 'Die simulierte Abrechnung startet einen neuen Zeitraum von 30 Tagen und ersetzt den laufenden Zeitraum.'}</p>
        <div className="flex flex-wrap gap-3">
          <PrimaryButton type="button" testId="confirm-saas-change" pending={save.isPending}
            onClick={() => save.mutate(selection)}>Bestätigen</PrimaryButton>
          <button type="button" className="underline" disabled={save.isPending} onClick={() => { setSelection(undefined); save.reset(); }}>Abbrechen</button>
        </div>
      </div>}
      {!!view.history.length && <ul className="mt-4 space-y-1 text-sm">
        {view.history.map((event) => <li key={event.requestId}>
          {date(event.createdAt)} · {labels[event.action]} · {view.plans.find((p) => p.code === event.planCode)?.name ?? event.planCode}
          {event.action === 'activate' && ' · ' + formatCents(event.amountCents) + ' simuliert'}
        </li>)}
      </ul>}
    </>}
    <FormStatus error={save.error ? errorText(save.error) : null} />
  </Panel>;
}

const adminPath = '/api/admin/saas-plans';

export function PlatformPlanSettings() {
  const plans = useQuery({ queryKey: [adminPath], queryFn: ({ signal }) => getBookingData<Plan[]>(adminPath, signal) });
  return <div className="mx-auto max-w-3xl space-y-4 px-5 py-10">
    <h1 className="font-display text-4xl">Geschäftstarife verwalten</h1>
    {plans.isPending && <p role="status">Tarife werden geladen …</p>}
    <FormStatus error={plans.error ? errorText(plans.error) : null} />
    {plans.data?.map((plan) => <PlanEditor key={plan.code} plan={plan} refresh={() => plans.refetch()} />)}
  </div>;
}

function PlanEditor({ plan, refresh }: { plan: Plan; refresh: () => Promise<unknown> }) {
  const [draft, setDraft] = useState<Omit<Plan, 'code'>>();
  const value = draft ?? plan;
  const update = (key: 'monthlyCents' | 'locationLimit' | 'trialDays', text: string) =>
    setDraft({ ...value, [key]: Number(text) });
  const save = useMutation({
    mutationFn: () => sendBookingData(adminPath + '/' + plan.code, {
      name: value.name, monthlyCents: value.monthlyCents, locationLimit: value.locationLimit, trialDays: value.trialDays,
    }, 'PUT'),
    onSuccess: async () => { await refresh(); setDraft(undefined); },
  });
  return <Panel title={plan.name}>
    <form onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <fieldset className="space-y-3" disabled={save.isPending}>
        <Field id={plan.code + '-name'} label="Tarifname"><input id={plan.code + '-name'} className={inputCls} required maxLength={80}
          value={value.name} onChange={(event) => setDraft({ ...value, name: event.target.value })} /></Field>
        <Field id={plan.code + '-price'} label="Preis je 30 Tage in Cent"><input id={plan.code + '-price'} className={inputCls}
          type="number" min={0} max={10000000} required value={value.monthlyCents}
          onChange={(event) => update('monthlyCents', event.target.value)} /></Field>
        <Field id={plan.code + '-limit'} label="Standortlimit"><input id={plan.code + '-limit'} className={inputCls}
          type="number" min={1} max={1000} required value={value.locationLimit} onChange={(event) => update('locationLimit', event.target.value)} /></Field>
        {plan.code === 'professional' && <Field id={plan.code + '-trial'} label="Testphase in Tagen"><input id={plan.code + '-trial'}
          className={inputCls} type="number" min={0} max={90} required value={value.trialDays}
          onChange={(event) => update('trialDays', event.target.value)} /></Field>}
        <PrimaryButton testId={'save-saas-plan-' + plan.code} disabled={!draft} pending={save.isPending}>Tarif speichern</PrimaryButton>
      </fieldset>
      {save.isSuccess && <p role="status">Tarif gespeichert.</p>}
      <FormStatus error={save.error ? errorText(save.error) : null} />
    </form>
  </Panel>;
}
