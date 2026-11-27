import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { BusinessWorkspace } from '@workspace/api-client-react';
import { Field, FormStatus, inputCls } from '@/components/forms';
import { appointmentLabel, dateInZone, sendBookingData } from '@/lib/booking';
import { errorText } from '@/lib/api';

type Start = { startsAt: string; endsAt: string[]; enabled: boolean };

export function OnlineSlots({ workspace, locationId, timezone, path }: {
  workspace: BusinessWorkspace; locationId: string; timezone: string; path: string;
}) {
  const services = workspace.services.filter((service) => service.locationId === locationId &&
    !service.archived && service.published && service.onlineBooking);
  const [serviceId, setServiceId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [date, setDate] = useState(() => dateInZone(timezone));
  const service = services.find(({ id }) => id === serviceId) ?? services[0];
  const item = { serviceId: service?.id, variantId: variantId || undefined };
  const query = useQuery({
    queryKey: [path, item, date],
    enabled: !!service && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= dateInZone(timezone),
    queryFn: () => sendBookingData<Start[]>(path, { item, date }),
  });
  const change = useMutation({
    mutationFn: ({ startsAt, enabled }: Pick<Start, 'startsAt' | 'enabled'>) =>
      sendBookingData(path, { item, startsAt, enabled }, 'PUT'),
    onSettled: () => query.refetch(),
  });
  const time = (value: string) => new Intl.DateTimeFormat('de-DE', { timeStyle: 'short', timeZone: timezone }).format(new Date(value));
  return <section aria-labelledby="online-slots-heading" className="space-y-3 rounded-xl border border-border p-4">
    <h3 id="online-slots-heading" className="font-display text-2xl">Online-Termine freigeben</h3>
    <p className="text-sm text-muted-foreground">Die Zeiten ergeben sich aus Leistungsdauer, Puffern, Arbeitszeiten und bestehenden Terminen. Entferne ein Häkchen, um diese Startzeit für alle Varianten der Leistung online auszublenden.</p>
    {!service ? <p className="text-sm">Aktiviere zuerst die Online-Buchung für eine öffentliche Leistung an diesem Standort.</p> : <>
      <fieldset disabled={change.isPending} className="grid gap-3 sm:grid-cols-3">
        <Field id="online-slot-service" label="Leistung">
          <select id="online-slot-service" className={inputCls} value={service.id} onChange={(event) => {
            setServiceId(event.target.value); setVariantId(''); change.reset();
          }}>
            {services.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select>
        </Field>
        {!!service.variants.length && <Field id="online-slot-variant" label="Variante für die Vorschau">
          <select id="online-slot-variant" className={inputCls} value={variantId} onChange={(event) => {
            setVariantId(event.target.value); change.reset();
          }}>
            <option value="">Standard</option>
            {service.variants.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select>
        </Field>}
        <Field id="online-slot-date" label="Datum für Online-Termine">
          <input id="online-slot-date" type="date" className={inputCls} min={dateInZone(timezone)} value={date}
            onChange={(event) => { setDate(event.target.value); change.reset(); }} />
        </Field>
      </fieldset>
      {query.isFetching && <p role="status" className="text-sm">Zeiten werden geladen …</p>}
      {query.isError && <button type="button" className="underline" onClick={() => void query.refetch()}>Zeiten erneut laden</button>}
      {query.data?.length === 0 && <p className="text-sm">An diesem Tag gibt es keine passenden Zeiten.</p>}
      <fieldset className="flex flex-wrap gap-2" disabled={change.isPending}>
        <legend className="sr-only">Buchbare Startzeiten</legend>
        {query.data?.map((slot) => <label key={slot.startsAt} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
          <input type="checkbox" checked={change.isPending && change.variables?.startsAt === slot.startsAt ? change.variables.enabled : slot.enabled} onChange={(event) => change.mutate({ startsAt: slot.startsAt, enabled: event.target.checked })}
            aria-label={appointmentLabel(slot.startsAt, timezone) + ' · ' + slot.startsAt.slice(11, 16) + ' UTC'} />
          <span>{time(slot.startsAt)}–{slot.endsAt.map(time).join(' / ')}</span>
        </label>)}
      </fieldset>
      <FormStatus error={change.error ? errorText(change.error) : null} success={change.isSuccess ? 'Startzeit aktualisiert.' : null} />
    </>}
  </section>;
}
