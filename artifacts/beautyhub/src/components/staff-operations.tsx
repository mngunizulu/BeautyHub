import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BusinessWorkspace } from '@workspace/api-client-react';
import { Field, FormStatus, Panel, PrimaryButton, inputCls } from '@/components/forms';
import { errorText, WEEKDAYS } from '@/lib/api';
import { getBookingData, sendBookingData } from '@/lib/booking';

type StaffBreak = { weekday: number; begins: string; ends: string };

export function StaffOperations({ workspace }: { workspace: BusinessWorkspace }) {
  const [selected, setSelected] = useState(workspace.employees[0]?.id ?? '');
  if (!workspace.employees.length) return null;
  return <Panel title="Regelmäßige Pausen">
    <Field id="break-employee" label="Teammitglied">
      <select id="break-employee" className={inputCls} value={selected} onChange={(event) => setSelected(event.target.value)}>
        {workspace.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.displayName}</option>)}
      </select>
    </Field>
    {selected && <BreakEditor key={selected} path={`/api/organizations/${workspace.id}/staff-breaks/${selected}`} />}
  </Panel>;
}

function BreakEditor({ path }: { path: string }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: [path], queryFn: ({ signal }) => getBookingData<StaffBreak[]>(path, signal) });
  const [date, setDate] = useState(1);
  const [begins, setBegins] = useState('12:00');
  const [ends, setEnds] = useState('12:30');
  const save = useMutation({
    mutationFn: (entries: StaffBreak[]) => sendBookingData<StaffBreak[]>(path, entries, 'PUT'),
    onSuccess: (entries) => qc.setQueryData([path], entries),
  });
  return <div className="mt-4 space-y-3">
    {query.isPending && <p role="status">Pausen werden geladen …</p>}
    {query.isError && <button type="button" className="underline" onClick={() => query.refetch()}>Pausen erneut laden</button>}
    {query.data && <>
      <ul className="space-y-2">
        {query.data.map((item, index) => <li key={`${item.weekday}/${item.begins}`}>
          {WEEKDAYS[item.weekday - 1]} · {item.begins}–{item.ends}
          <button type="button" className="ml-3 underline" disabled={save.isPending}
            onClick={() => save.mutate(query.data.filter((_, position) => position !== index))}>Entfernen</button>
        </li>)}
      </ul>
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); save.mutate([...query.data, { weekday: date, begins, ends }]); }}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="break-day" label="Wochentag"><select id="break-day" className={inputCls} value={date} onChange={(e) => setDate(Number(e.target.value))}>
            {WEEKDAYS.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}
          </select></Field>
          <Field id="break-start" label="Beginn"><input id="break-start" className={inputCls} type="time" value={begins} required onChange={(e) => setBegins(e.target.value)} /></Field>
          <Field id="break-end" label="Ende"><input id="break-end" className={inputCls} type="time" value={ends} required onChange={(e) => setEnds(e.target.value)} /></Field>
        </div>
        <PrimaryButton testId="add-recurring-break" pending={save.isPending} disabled={save.isPending || query.data.length >= 28}>Pause hinzufügen</PrimaryButton>
      </form>
    </>}
    <FormStatus error={save.error ? errorText(save.error) : null} />
  </div>;
}
