import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BusinessWorkspace } from '@workspace/api-client-react';
import { Field, FormStatus, Panel, PrimaryButton, inputCls } from '@/components/forms';
import { errorText, WEEKDAYS } from '@/lib/api';
import { getBookingData, sendBookingData } from '@/lib/booking';

type StaffBreak = { weekday: number; begins: string; ends: string };

export function StaffOperations({ workspace }: { workspace: BusinessWorkspace }) {
  const [selected, setSelected] = useState(workspace.employees[0]?.id ?? '');
  const employee = workspace.employees.find(({ id }) => id === selected) ?? workspace.employees[0];
  if (!employee) return null;
  return <Panel title="Regelmäßige Pausen">
    <Field id="break-employee" label="Teammitglied">
      <select id="break-employee" className={inputCls} value={employee.id} onChange={(event) => setSelected(event.target.value)}>
        {workspace.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.displayName}</option>)}
      </select>
    </Field>
    <BreakEditor key={employee.id} path={`/api/organizations/${workspace.id}/staff-breaks/${employee.id}`}
      weekdays={employee.workingHours.map(({ weekday }) => weekday).sort((a, b) => a - b)} />
  </Panel>;
}

function BreakEditor({ path, weekdays }: { path: string; weekdays: number[] }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: [path], queryFn: ({ signal }) => getBookingData<StaffBreak[]>(path, signal) });
  const [day, setDay] = useState("all");
  const [begins, setBegins] = useState('12:00');
  const [ends, setEnds] = useState('12:30');
  const save = useMutation({
    mutationFn: (entries: StaffBreak[]) => sendBookingData<StaffBreak[]>(path, entries, 'PUT'),
    onSuccess: (entries) => qc.setQueryData([path], entries),
  });
  const selectedDays = day === "all" ? weekdays : weekdays.filter((weekday) => weekday === Number(day));
  const additions = selectedDays.filter((weekday) => !query.data?.some((entry) =>
    entry.weekday === weekday && entry.begins === begins && entry.ends === ends))
    .map((weekday) => ({ weekday, begins, ends }));
  const tooMany = (query.data?.length ?? 0) + additions.length > 28;
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
      <form className="space-y-3" onSubmit={(event) => {
        event.preventDefault();
        if (additions.length && !tooMany && !save.isPending) save.mutate([...query.data, ...additions]);
      }}>
        <p className="text-sm text-muted-foreground">Die Pause wiederholt sich jede Woche an den gewählten Arbeitstagen.</p>
        {!weekdays.length && <p role="status" className="text-sm">Trage zuerst Arbeitszeiten für dieses Teammitglied ein.</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="break-day" label="Wochentage"><select id="break-day" className={inputCls} value={day} onChange={(e) => setDay(e.target.value)}>
            <option value="all">Alle Arbeitstage</option>
            {weekdays.map((weekday) => <option key={weekday} value={weekday}>{WEEKDAYS[weekday - 1]}</option>)}
          </select></Field>
          <Field id="break-start" label="Beginn"><input id="break-start" className={inputCls} type="time" value={begins} required onChange={(e) => setBegins(e.target.value)} /></Field>
          <Field id="break-end" label="Ende"><input id="break-end" className={inputCls} type="time" value={ends} required onChange={(e) => setEnds(e.target.value)} /></Field>
        </div>
        {day === "all" && weekdays.length > 0 && <p className="text-sm text-muted-foreground">
          {weekdays.map((weekday) => WEEKDAYS[weekday - 1]).join(", ")}
        </p>}
        {tooMany && <p role="status" className="text-sm">Pro Teammitglied sind höchstens 28 regelmäßige Pausen möglich.</p>}
        <PrimaryButton testId="add-recurring-break" pending={save.isPending} disabled={save.isPending || tooMany || !additions.length}>Pause hinzufügen</PrimaryButton>
      </form>
    </>}
    <FormStatus error={save.error ? errorText(save.error) : null} success={save.isSuccess ? "Pausen gespeichert." : null} />
  </div>;
}
