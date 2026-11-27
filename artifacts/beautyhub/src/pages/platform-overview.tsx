import { Link } from 'wouter';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Field, FormStatus, Panel, PrimaryButton, inputCls } from '@/components/forms';
import { dateInZone, getBookingData, sendBookingData } from '@/lib/booking';
import { errorText } from '@/lib/api';
import { formatCents } from '@/lib/format';

type Metrics = {
  business: { total: number; verified: number; suspended: number };
  customers: { total: number; deletionRequested: number };
  visits: { total: number; completed: number; cancelled: number; noShows: number };
  subscriptions: { trial: number; active: number; expired: number; cancelled: number };
  billing: { activations: number; simulatedCents: number };
  support: { open: number; resolved: number };
};
type Settings = { businessRegistrationOpen: boolean; supportIntakeOpen: boolean };
type SettingsView = {
  current: Settings;
  history: { id: string; previous: Settings; current: Settings; createdAt: string }[];
};
const zone = 'Europe/Berlin';
const number = new Intl.NumberFormat('de-DE');
const dates = new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short', timeZone: zone });
const settingsPath = '/api/admin/platform-settings';
const controls = {
  businessRegistrationOpen: 'Neue Betriebsregistrierungen erlauben',
  supportIntakeOpen: 'Neue Supportanfragen erlauben',
};
const keys = Object.keys(controls) as (keyof Settings)[];

export default function PlatformOverview() {
  const [range, setRange] = useState(() => {
    const to = dateInZone(zone);
    return { from: to.slice(0, 7) + '-01', to };
  });
  const path = '/api/admin/platform-analytics?' + new URLSearchParams(range);
  const days = (Date.parse(range.to) - Date.parse(range.from)) / 86400000;
  const valid = Number.isFinite(days) && days >= 0 && days < 366;
  const analytics = useQuery({
    queryKey: [path], enabled: valid, queryFn: ({ signal }) => getBookingData<Metrics>(path, signal),
  });
  const data = analytics.data;
  return <div className="mx-auto max-w-5xl space-y-6 px-5 py-10">
    <h1 className="font-display text-4xl">Plattformübersicht</h1>
    <Link href="/admin/startseite" className="inline-block underline">Startseitengalerie</Link>
    <Panel title="Plattformberichte">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="platform-from" label="Von"><input id="platform-from" type="date" className={inputCls}
          value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} /></Field>
        <Field id="platform-to" label="Bis"><input id="platform-to" type="date" className={inputCls}
          value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} /></Field>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">Der Zeitraum gilt für Termine und simulierte Tarifaktivierungen. Die übrigen Kennzahlen zeigen den aktuellen Stand.</p>
      {valid && analytics.isPending && <p role="status">Bericht wird geladen …</p>}
      {analytics.isError && <button type="button" className="underline" onClick={() => analytics.refetch()}>Bericht erneut laden</button>}
      <FormStatus error={!valid ? 'Wähle einen Zeitraum von höchstens 366 Tagen.' : analytics.error ? errorText(analytics.error) : null} />
      {data && <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <MetricsGroup title="Betriebe" values={[['Gesamt', data.business.total], ['Verifiziert', data.business.verified], ['Gesperrt', data.business.suspended]]} />
        <MetricsGroup title="Kundenkonten" values={[['Gesamt', data.customers.total], ['Mit Löschanfrage', data.customers.deletionRequested]]} />
        <MetricsGroup title="Termine" values={[['Gesamt', data.visits.total], ['Abgeschlossen', data.visits.completed],
          ['Storniert', data.visits.cancelled], ['Nicht erschienen', data.visits.noShows]]} />
        <MetricsGroup title="Geschäftstarife" values={[['Testphase', data.subscriptions.trial], ['Aktiv', data.subscriptions.active],
          ['Abgelaufen', data.subscriptions.expired], ['Gekündigt', data.subscriptions.cancelled]]} />
        <MetricsGroup title="Simulierte Abrechnung" values={[['Aktivierungen', data.billing.activations],
          ['Betrag', formatCents(data.billing.simulatedCents)]]} />
        <MetricsGroup title="Supportfälle" values={[['Offen', data.support.open], ['Geschlossen', data.support.resolved]]} />
      </div>}
    </Panel>
    <SettingsPanel />
  </div>;
}

function MetricsGroup({ title, values }: { title: string; values: [string, number | string][] }) {
  return <section className="rounded-xl border p-3">
    <h3 className="font-semibold">{title}</h3>
    <dl className="mt-2 space-y-1 text-sm">{values.map(([label, value]) => <div className="flex justify-between gap-3" key={label}>
      <dt>{label}</dt><dd className="tabular-nums">{typeof value === 'number' ? number.format(value) : value}</dd>
    </div>)}</dl>
  </section>;
}

function SettingsPanel() {
  const query = useQuery({ queryKey: [settingsPath], queryFn: ({ signal }) => getBookingData<SettingsView>(settingsPath, signal) });
  const [draft, setDraft] = useState<{ expected: Settings; next: Settings }>();
  const save = useMutation({
    mutationFn: (change: NonNullable<typeof draft>) => sendBookingData(settingsPath, change, 'PUT'),
    onSuccess: async () => { await query.refetch(); setDraft(undefined); },
  });
  const current = query.data?.current;
  const value = draft?.next ?? current;
  const changed = !!draft && keys.some((key) => draft.expected[key] !== draft.next[key]);
  return <Panel title="Plattformeinstellungen">
    {query.isPending && <p role="status">Einstellungen werden geladen …</p>}
    {query.isError && <button type="button" className="underline" onClick={() => query.refetch()}>Einstellungen erneut laden</button>}
    {value && current && <form className="space-y-3" onSubmit={(event) => {
      event.preventDefault();
      if (draft && changed) save.mutate(draft);
    }}>
      <fieldset className="space-y-2" disabled={save.isPending}>
        {keys.map((key) => <label key={key} className="flex items-center gap-2">
          <input type="checkbox" checked={value[key]} onChange={(event) => {
            setDraft({ expected: draft?.expected ?? current, next: { ...value, [key]: event.target.checked } });
            save.reset();
          }} />{controls[key]}
        </label>)}
        <p className="text-sm text-muted-foreground">Die Einstellungen gelten für neue Registrierungen und neue Anfragen.</p>
        <div className="flex flex-wrap gap-3">
          <PrimaryButton testId="save-platform-settings" pending={save.isPending} disabled={!changed}>Einstellungen speichern</PrimaryButton>
          {draft && <button type="button" className="underline" onClick={() => { setDraft(undefined); save.reset(); void query.refetch(); }}>
            Änderungen verwerfen</button>}
        </div>
      </fieldset>
    </form>}
    {save.isSuccess && <p role="status">Plattformeinstellungen gespeichert.</p>}
    <FormStatus error={save.error || query.error ? errorText(save.error ?? query.error) : null} />
    {!!query.data?.history.length && <ul className="mt-4 space-y-2 text-sm">
      {query.data.history.map((entry) => <li key={entry.id}>
        {dates.format(new Date(entry.createdAt))}{keys.filter((key) => entry.previous[key] !== entry.current[key]).map((key) =>
          <span key={key}> · {controls[key]} · {entry.current[key] ? 'Ja' : 'Nein'}</span>)}
      </li>)}
    </ul>}
  </Panel>;
}
