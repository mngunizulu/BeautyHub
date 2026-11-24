import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Field, FormStatus, Panel, PrimaryButton, inputCls } from '@/components/forms';
import { getBookingData, sendBookingData } from '@/lib/booking';
import { errorText } from '@/lib/api';

type State = 'open' | 'resolved';
type Case = { id: string; subject: string; state: State };
type Message = { id: string; kind: 'customer' | 'staff' | 'resolved' | 'reopened'; body: string; createdAt: string };
type Thread = Case & { messages: Message[]; hasOlder: boolean };
const label = { open: 'Offen', resolved: 'Geschlossen', customer: 'Kunde', staff: 'BeautyHub-Support',
  reopened: 'Anfrage wieder geöffnet' };
const dates = new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' });

export default function SupportPage({ admin = false }: { admin?: boolean }) {
  const path = admin ? '/api/admin/support-cases' : '/api/me/support-cases';
  const [filter, setFilter] = useState<State | ''>(admin ? 'open' : '');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState('');
  const list = useQuery({
    queryKey: [path, filter, offset],
    queryFn: ({ signal }) => getBookingData<{ cases: Case[]; hasMore: boolean }>(
      path + '?' + new URLSearchParams({ offset: String(offset), ...(filter ? { state: filter } : {}) }), signal),
  });

  return <div className="mx-auto max-w-5xl space-y-4 px-5 py-10">
    <h1 className="font-display text-4xl">{admin ? 'Supportfälle' : 'Meine Supportanfragen'}</h1>
    <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
      <Panel title="Anfragen">
        <Field id="support-filter" label="Status"><select id="support-filter" className={inputCls} value={filter}
          onChange={(event) => { setOffset(0); setFilter(event.target.value as State | ''); }}>
          <option value="">Alle</option><option value="open">Offen</option><option value="resolved">Geschlossen</option>
        </select></Field>
        {list.isPending && <p role="status">Anfragen werden geladen …</p>}
        {list.data?.cases.length === 0 && <p>Keine passenden Anfragen.</p>}
        <FormStatus error={list.error ? errorText(list.error) : null} />
        <ul className="mt-2 space-y-2">
          {list.data?.cases.map((entry) => <li key={entry.id}>
            <button type="button" className="text-left underline" aria-pressed={selected === entry.id}
              onClick={() => setSelected(entry.id)}>{entry.subject} · {label[entry.state]}</button>
          </li>)}
        </ul>
        <div className="mt-3 flex gap-3">
          {offset > 0 && <button type="button" className="underline" onClick={() => setOffset(offset - 20)}>Zurück</button>}
          {list.data?.hasMore && <button type="button" className="underline" onClick={() => setOffset(offset + 20)}>Weitere Anfragen</button>}
        </div>
        {!admin && !!selected && <button type="button" className="mt-3 underline" onClick={() => setSelected('')}>Neue Anfrage</button>}
      </Panel>
      {selected ? <Conversation key={selected} path={path} id={selected} admin={admin} />
        : !admin ? <NewCase path={path} onCreate={(id) => { setFilter(''); setOffset(0); setSelected(id); }} />
        : <p>Wähle eine Anfrage aus.</p>}
    </div>
  </div>;
}

function NewCase({ path, onCreate }: { path: string; onCreate: (id: string) => void }) {
  const client = useQueryClient();
  const [requestId] = useState(() => crypto.randomUUID());
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const save = useMutation({
    mutationFn: () => sendBookingData<Case>(path, { subject, body, requestId }),
    onSuccess: async (entry) => { await client.invalidateQueries({ queryKey: [path] }); onCreate(entry.id); },
  });
  return <Panel title="Neue Anfrage">
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <fieldset disabled={save.isPending} className="space-y-3">
        <Field id="support-subject" label="Betreff"><input id="support-subject" className={inputCls}
          required maxLength={120} value={subject} onChange={(event) => setSubject(event.target.value)} /></Field>
        <Field id="support-body" label="Nachricht"><textarea id="support-body" className={inputCls}
          required maxLength={4000} rows={5} value={body} onChange={(event) => setBody(event.target.value)} /></Field>
        <PrimaryButton testId="create-support-case" pending={save.isPending} disabled={!subject.trim() || !body.trim()}>Anfrage senden</PrimaryButton>
      </fieldset>
      <FormStatus error={save.error ? errorText(save.error) : null} />
    </form>
  </Panel>;
}

function Conversation({ path, id, admin }: { path: string; id: string; admin: boolean }) {
  const client = useQueryClient();
  const endpoint = path + '/' + id;
  const [offset, setOffset] = useState(0);
  const [body, setBody] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const refresh = async () => { setOffset(0); await client.invalidateQueries({ queryKey: [path] }); };
  const thread = useQuery({ queryKey: [path, id, offset], queryFn: ({ signal }) => getBookingData<Thread>(endpoint + '?offset=' + offset, signal) });
  const reply = useMutation({
    mutationFn: () => sendBookingData(endpoint + '/messages', { body, requestId }),
    onSuccess: async () => { setBody(''); setRequestId(crypto.randomUUID()); await refresh(); },
  });
  const status = useMutation({ mutationFn: (state: State) => sendBookingData(endpoint + '/state', { state }, 'PUT'), onSuccess: refresh });
  if (!thread.data) return <Panel title="Unterhaltung">
    {thread.isPending && <p role="status">Nachrichten werden geladen …</p>}
    <FormStatus error={thread.error ? errorText(thread.error) : null} />
  </Panel>;
  const currentState = thread.data.state;
  return <Panel title={thread.data.subject}>
    <p>{label[thread.data.state]}</p>
    <div className="flex gap-3">
      {thread.data.hasOlder && <button type="button" className="underline" onClick={() => setOffset(offset + 50)}>Ältere Nachrichten</button>}
      {offset > 0 && <button type="button" className="underline" onClick={() => setOffset(offset - 50)}>Neuere Nachrichten</button>}
    </div>
    <ol className="my-4 space-y-3">{thread.data.messages.map((entry) => <li key={entry.id} className="rounded-xl border p-3">
      <p className="text-sm font-medium">{entry.kind === 'resolved' ? 'Anfrage geschlossen' : label[entry.kind]}
        {' · '}{dates.format(new Date(entry.createdAt))}</p>
      {entry.body && <p className="whitespace-pre-wrap break-words">{entry.body}</p>}
    </li>)}</ol>
    {thread.data.state === 'open' && <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); reply.mutate(); }}>
      <Field id="support-reply" label="Antwort"><textarea id="support-reply" className={inputCls}
        disabled={reply.isPending || status.isPending} required maxLength={4000} value={body}
        onChange={(event) => setBody(event.target.value)} /></Field>
      <PrimaryButton testId="send-support-reply" pending={reply.isPending} disabled={!body.trim() || status.isPending}>Antwort senden</PrimaryButton>
    </form>}
    {admin && <PrimaryButton type="button" variant="ghost" testId="change-support-state" pending={status.isPending} disabled={reply.isPending}
      onClick={() => status.mutate(currentState === 'open' ? 'resolved' : 'open')}>
      {thread.data.state === 'open' ? 'Anfrage schließen' : 'Anfrage wieder öffnen'}
    </PrimaryButton>}
    <FormStatus error={reply.error || status.error ? errorText(reply.error ?? status.error) : null} />
  </Panel>;
}
