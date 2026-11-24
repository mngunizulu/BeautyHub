import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Field, FormStatus, PrimaryButton, inputCls } from '@/components/forms';
import { errorText } from '@/lib/api';
import { appointmentLabel, dateInZone, sendBookingData, type Booking, type Slot } from '@/lib/booking';

export function CalendarMove({ booking, initialDate, path, onComplete, onClose }: {
  booking: Booking; initialDate: string; path: string; onComplete: (date: string) => void; onClose: () => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [selected, setSelected] = useState('');
  const search = useMutation({
    mutationFn: () => sendBookingData<{ slots: Slot[] }>(`${path}/${booking.id}/availability`, { date }),
  });
  const move = useMutation({
    mutationFn: (slot: Slot) => sendBookingData(`${path}/${booking.id}/reschedule`, {
      startsAt: slot.startsAt, employeeId: slot.employeeId,
      expectedStartsAt: booking.startsAt, expectedEmployeeId: booking.employeeId,
    }),
    onSuccess: () => onComplete(date),
  });
  const slotId = (slot: Slot) => `${slot.employeeId}/${slot.startsAt}`;
  const slot = search.data?.slots.find((entry) => slotId(entry) === selected);
  const pending = search.isPending || move.isPending;
  return <section className="my-4 space-y-3 rounded-xl border border-border p-4" aria-labelledby="calendar-move-heading">
    <h3 id="calendar-move-heading" className="font-medium">Termin verschieben · {booking.customerName}</h3>
    <Field id="move-date" label="Neues Datum">
      <input id="move-date" type="date" className={inputCls} value={date} min={dateInZone(booking.timezone)}
        disabled={pending} onChange={(event) => { setDate(event.target.value); setSelected(''); search.reset(); move.reset(); }} />
    </Field>
    <PrimaryButton type="button" testId="calendar-move-search" disabled={pending || !date} pending={search.isPending}
      onClick={() => { setSelected(''); move.reset(); search.mutate(); }}>Freie Zeiten suchen</PrimaryButton>
    {search.data && (search.data.slots.length ? <Field id="move-slot" label="Neue Zeit">
      <select id="move-slot" className={inputCls} value={selected} disabled={pending} onChange={(e) => setSelected(e.target.value)}>
        <option value="">Zeit auswählen</option>
        {search.data.slots.map((entry) => <option key={slotId(entry)} value={slotId(entry)}>
          {appointmentLabel(entry.startsAt, booking.timezone)} · {new Date(entry.startsAt).toISOString().slice(11, 16)} UTC · {entry.employeeName}
        </option>)}
      </select>
    </Field> : <p role="status">Keine freien Zeiten.</p>)}
    <div className="flex gap-3">
      <PrimaryButton type="button" testId="calendar-move-confirm" disabled={!slot || pending} pending={move.isPending}
        onClick={() => { if (slot) move.mutate(slot); }}>Verschiebung speichern</PrimaryButton>
      <button type="button" className="underline" disabled={move.isPending} onClick={onClose}>Abbrechen</button>
    </div>
    <FormStatus error={search.error || move.error ? errorText(search.error ?? move.error) : null} />
  </section>;
}
