import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Field, FormStatus, Panel, PrimaryButton, inputCls } from '@/components/forms';
import { getBookingData, sendBookingData } from '@/lib/booking';
import { errorText } from '@/lib/api';

type Preference = { organizationId: string; name: string; consent: boolean };
type Segment = 'completed' | 'repeat';
type Campaign = { id: string; title: string; subject: string; body: string; segment: Segment };
const empty: Omit<Campaign, 'id'> = { title: '', subject: '', body: '', segment: 'completed' };
const settings = '/api/me/business-marketing';

export function BusinessMarketingPreferences() {
  const prefs = useQuery({ queryKey: [settings], queryFn: ({ signal }) => getBookingData<Preference[]>(settings, signal) });
  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get('business-marketing');
    if (prefs.data?.some(({ organizationId }) => target === organizationId)) {
      document.getElementById('business-marketing-' + target)?.scrollIntoView({ block: 'center' });
    }
  }, [prefs.data]);
  const save = useMutation({
    mutationFn: ({ organizationId, consent }: Pick<Preference, 'organizationId' | 'consent'>) =>
      sendBookingData(settings + '/' + organizationId, { consent }, 'PUT'),
    onSuccess: () => prefs.refetch(),
  });
  return <Panel title="Werbe-E-Mails von Betrieben">
    {prefs.isPending && <p role="status">Einstellungen werden geladen.</p>}
    {prefs.isError && <button type="button" className="underline" onClick={() => prefs.refetch()}>Einstellungen erneut laden</button>}
    {prefs.data?.length === 0 && <p>Hier erscheinen Betriebe nach einem abgeschlossenen Termin.</p>}
    {!!prefs.data?.length && <ul className="space-y-3">{prefs.data.map((row) => <li key={row.organizationId} id={"business-marketing-" + row.organizationId}
      className="flex flex-wrap items-center justify-between gap-2">
      <span>{row.name} · {row.consent ? 'Erlaubt' : 'Aus'}</span>
      <button type="button" className="underline" disabled={save.isPending}
        onClick={() => save.mutate({ organizationId: row.organizationId, consent: !row.consent })}>
        {row.consent ? 'Werbe-E-Mails abbestellen' : 'Werbe-E-Mails erlauben'}
      </button>
    </li>)}</ul>}
    <FormStatus error={save.error ? errorText(save.error) : null} />
  </Panel>;
}

export function MarketingCampaigns({ organizationId }: { organizationId: string }) {
  const path = '/api/organizations/' + organizationId + '/marketing-campaigns';
  const templatePath = '/api/organizations/' + organizationId + '/marketing-templates';
  const [templateId, setTemplateId] = useState('');
  const templates = useQuery({
    queryKey: [templatePath], queryFn: ({ signal }) => getBookingData<Campaign[]>(templatePath, signal),
  });
  const [draftId, setDraftId] = useState('');
  const [draft, setDraft] = useState(empty);
  const list = useQuery({ queryKey: [path], queryFn: ({ signal }) => getBookingData<Campaign[]>(path, signal) });
  const audience = useQuery({
    queryKey: [path, 'audience', draft.segment],
    queryFn: ({ signal }) => getBookingData<{ count: number }>(path + '/audience?segment=' + draft.segment, signal),
  });
  const save = useMutation({
    mutationFn: () => sendBookingData<Campaign>(draftId ? path + '/' + draftId : path, draft, draftId ? 'PUT' : 'POST'),
    onSuccess: async (saved) => { setDraftId(saved.id); setTemplateId(''); saveTemplate.reset(); await list.refetch(); },
  });
  const saveTemplate = useMutation({
    mutationFn: () => sendBookingData<Campaign>(templateId ? templatePath + '/' + templateId : templatePath,
      draft, templateId ? 'PUT' : 'POST'),
    onSuccess: async (saved) => { if (!draftId) setTemplateId(saved.id); await templates.refetch(); },
  });
  const select = (campaign: Campaign) => {
    setTemplateId('');
    saveTemplate.reset();
    setDraftId(campaign.id);
    setDraft({ title: campaign.title, subject: campaign.subject, body: campaign.body, segment: campaign.segment });
    save.reset();
  };
  const selected = list.data?.find(({ id }) => id === draftId);
  const clean = !!selected && selected.title === draft.title.trim() && selected.subject === draft.subject.trim() &&
    selected.body === draft.body.trim() && selected.segment === draft.segment;
  const valid = !!draft.title.trim() && !!draft.subject.trim() && !!draft.body.trim();
  const submit = (event: FormEvent) => { event.preventDefault(); if (valid) save.mutate(); };
  return <Panel title="Kampagnenentwürfe">
    {list.isError && <button type="button" className="underline" onClick={() => list.refetch()}>Entwürfe erneut laden</button>}
    <div className="flex flex-wrap gap-3 pb-4 text-sm">
      {list.data?.map((row) => <button type="button" key={row.id} className="underline" disabled={save.isPending || saveTemplate.isPending} onClick={() => select(row)}>{row.title}</button>)}
      {!!draftId && <button type="button" className="underline" disabled={save.isPending}
        onClick={() => { setDraftId(''); setTemplateId(''); setDraft({ ...draft, title: '' }); save.reset(); saveTemplate.reset(); }}>Aus Entwurf kopieren</button>}
      {!!draftId && <button type="button" className="underline" disabled={save.isPending || saveTemplate.isPending}
        onClick={() => { setDraftId(''); setTemplateId(''); setDraft(empty); save.reset(); saveTemplate.reset(); }}>Neuer Entwurf</button>}
    </div>
    <div className="mb-4 space-y-2">
      <label htmlFor="campaign-template" className="block text-sm">Kampagnenvorlage</label>
      <select id="campaign-template" className={inputCls} value={templateId}
        disabled={save.isPending || saveTemplate.isPending}
        onChange={(event) => {
          const template = templates.data?.find(({ id }) => id === event.target.value);
          setDraftId('');
          setTemplateId(template?.id ?? '');
          setDraft(template ? { title: template.title, subject: template.subject, body: template.body, segment: template.segment } : empty);
          save.reset();
          saveTemplate.reset();
        }}>
        <option value="">Keine Vorlage</option>
        {templates.data?.map((row) => <option value={row.id} key={row.id}>{row.title}</option>)}
      </select>
      {templates.isError && <button type="button" className="underline" onClick={() => templates.refetch()}>Vorlagen erneut laden</button>}
    </div>
    <form onSubmit={submit}>
      <fieldset className="space-y-3" disabled={save.isPending || saveTemplate.isPending}>
        <Field id="campaign-title" label="Interner Titel"><input id="campaign-title" className={inputCls} maxLength={120}
          value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field>
        <Field id="campaign-subject" label="Betreff"><input id="campaign-subject" className={inputCls} maxLength={160}
          value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} /></Field>
        <Field id="campaign-body" label="Nachricht"><textarea id="campaign-body" className={inputCls} rows={5} maxLength={4000}
          value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} /></Field>
        <Field id="campaign-segment" label="Zielgruppe"><select id="campaign-segment" className={inputCls}
          value={draft.segment} onChange={(event) => setDraft({ ...draft, segment: event.target.value as Segment })}>
          <option value="completed">Abgeschlossener Termin</option>
          <option value="repeat">Mindestens zwei abgeschlossene Termine</option>
        </select></Field>
        {audience.data && <p role="status">{audience.data.count} Kontakte mit Einwilligung</p>}
        <button type="button" className="text-sm underline" disabled={audience.isFetching} onClick={() => audience.refetch()}>Zielgruppe aktualisieren</button>
        <PrimaryButton type="submit" testId="save-marketing-campaign" disabled={!valid} pending={save.isPending}>Entwurf speichern</PrimaryButton>
        <PrimaryButton type="button" testId="save-marketing-template" disabled={!valid} pending={saveTemplate.isPending} onClick={() => saveTemplate.mutate()}>
          {templateId ? 'Vorlage aktualisieren' : 'Als Vorlage speichern'}
        </PrimaryButton>
      </fieldset>
    </form>
    <FormStatus error={saveTemplate.error ? errorText(saveTemplate.error) : null} />
    {saveTemplate.isSuccess && <p role="status">Vorlage gespeichert.</p>}
    <FormStatus error={save.error ? errorText(save.error) : null} />
    {save.isSuccess && <p role="status">Entwurf gespeichert.</p>}
    {draftId && <CampaignCapture key={draftId} path={path + '/' + draftId + '/captures'} enabled={clean} />}
  </Panel>;
}

function CampaignCapture({ path, enabled }: { path: string; enabled: boolean }) {
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const history = useQuery({
    queryKey: [path],
    queryFn: ({ signal }) => getBookingData<{ id: string; count: number; createdAt: string }[]>(path, signal),
  });
  const run = useMutation({
    mutationFn: () => sendBookingData<{ count: number }>(path, { idempotencyKey: requestKey }),
    onSuccess: async () => { setRequestKey(crypto.randomUUID()); await history.refetch(); },
  });
  return <section className="mt-5 space-y-2 border-t border-border pt-4" aria-label="Testaufzeichnungen">
    <PrimaryButton type="button" testId="capture-marketing-campaign" pending={run.isPending}
      disabled={!enabled} onClick={() => run.mutate()}>Kampagne lokal aufzeichnen</PrimaryButton>
    {!enabled && <p className="text-sm">Speichere zuerst die aktuellen Änderungen.</p>}
    {run.data && <p role="status">{run.data.count} Kontakte lokal aufgezeichnet.</p>}
    <FormStatus error={run.error || history.error ? errorText(run.error ?? history.error) : null} />
    {!!history.data?.length && <ul className="space-y-1 text-sm">{history.data.map((row) => <li key={row.id}>
      {new Date(row.createdAt).toLocaleString('de-DE')} · {row.count} Kontakte
    </li>)}</ul>}
  </section>;
}
