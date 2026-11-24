import { useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch, getListMyPaymentMethodsQueryKey, useListMyPaymentMethods, type BusinessDetail, type MyAppointmentPaymentHistory } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { Field, FormStatus, Panel, PrimaryButton, inputCls } from '@/components/forms';
import { errorText } from '@/lib/api';
import { formatCents } from '@/lib/format';
import {
  appointmentLabel, dateInZone, getBookingData, myBookingsKey, sendBookingData, statusLabel,
  type Availability, type Booking, type QuoteLine, type SelectionItem, type Slot,
} from '@/lib/booking';

export function SalonBooking({ business }: { business: BusinessDetail }) {
  const auth = useAuth();
  const [items, setItems] = useState<SelectionItem[]>([]);
  const [date, setDate] = useState(dateInZone(business.timezone));
  const services = business.services.filter((item) => item.onlineBooking);
  const groups = new Map<string | null, typeof services>();
  for (const service of services) {
    const name = service.groupName ?? null;
    const group = groups.get(name) ?? [];
    group.push(service);
    groups.set(name, group);
  }
  const selectedServices = items.flatMap(({ serviceId, variantId }) => {
    const service = services.find(({ id }) => id === serviceId);
    if (!service) return [];
    const variant = service.variants?.find(({ id }) => id === variantId);
    return [{ name: service.name, variantName: variant?.name ?? null,
      priceCents: variant?.priceCents ?? service.priceCents, durationMinutes: variant?.durationMinutes ?? service.durationMinutes }];
  });
  if (!services.length) return null;
  return (
    <Panel title="Termin buchen">
      <fieldset className="space-y-2">
        <legend className="mb-3 font-medium">Leistungen auswählen</legend>
        {[...groups].map(([name, group]) => <details key={name ?? ''} open className="rounded-lg border border-border px-3 py-2">
          <summary className="cursor-pointer font-medium">{name ?? 'Weitere Leistungen'}</summary>
          <div className="mt-2 space-y-3">{group.map((service) => {
          const selected = items.find((item) => item.serviceId === service.id);
          return <div key={service.id} className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!selected} disabled={!selected && items.length >= 12}
                onChange={() => setItems(selected ? items.filter(({ serviceId }) => serviceId !== service.id) : [...items, { serviceId: service.id }])} />
              {service.name}
            </label>
            <span className="text-sm text-muted-foreground">{formatCents(service.priceCents)} · {service.durationMinutes} Min.</span>
            {service.description && <span className="w-full text-sm text-muted-foreground">{service.description}</span>}
            {selected && !!service.variants?.length && (
              <select className="rounded-lg border border-border bg-background p-2" aria-label={`Variante für ${service.name}`}
                value={selected.variantId ?? ''} onChange={(e) => setItems(items.map((item) => item.serviceId === service.id
                  ? { serviceId: item.serviceId, variantId: e.target.value || undefined } : item))}>
                <option value="">Standard</option>
                {service.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name} · {formatCents(variant.priceCents)}</option>)}
              </select>
            )}
          </div>;
          })}</div>
        </details>)}
      </fieldset>
      {items.length > 0 && <BookSelection key={JSON.stringify(items)} business={business} items={items} signedIn={!!auth.userId}
        date={date} setDate={setDate} selectedServices={selectedServices} />}
    </Panel>
  );
}

function SlotPicker({ slots, zone, selected, onChange }: { slots: Slot[]; zone: string; selected: string; onChange: (slot: string) => void }) {
  const id = useId();
  return <Field id={id} label="Verfügbare Termine">
    <select id={id} className={inputCls} value={selected} onChange={(e) => onChange(e.target.value)}>
      <option value="">Termin auswählen</option>
      {slots.map((slot) => <option key={slotKey(slot)} value={slotKey(slot)}>
        {appointmentLabel(slot.startsAt, zone)} · {new Date(slot.startsAt).toISOString().slice(11, 16)} UTC · {slot.mixed ? 'Mehrere Fachkräfte' : slot.employeeName}
      </option>)}
    </select>
  </Field>;
}
const calendarDate = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const spokenDate = new Intl.DateTimeFormat('de-DE', { dateStyle: 'full', timeZone: 'UTC' });

const slotKey = (slot: Slot) => `${slot.employeeId}/${slot.startsAt}`;
const feeLabel = (type: 'fixed' | 'percentage', value: number, priceCents?: number) => {
  if (type === 'fixed') return formatCents(value);
  return priceCents === undefined ? `${value} %` : `${formatCents(Math.round(priceCents * value / 100))} (${value} %)`;
};

function BookSelection({ business, items, signedIn, date, setDate, selectedServices }: {
  business: BusinessDetail; items: SelectionItem[]; signedIn: boolean; date: string; setDate: (date: string) => void; selectedServices: QuoteLine[];
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [appointmentNote, setAppointmentNote] = useState('');
  const [weekStart, setWeekStart] = useState(() => date || dateInZone(business.timezone));
  const [professionalId, setProfessionalId] = useState('');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const base = `/api/businesses/${business.slug}`;
  const methodsKey = getListMyPaymentMethodsQueryKey();
  const methods = useListMyPaymentMethods({ query: { queryKey: methodsKey, enabled: signedIn } });
  const paymentMethod = methods.data?.find(({ provider, status }) => provider === 'beautyhub-simulated' && status === 'active');
  const setupPayment = useMutation({
    mutationFn: () => sendBookingData('/api/me/payment-methods/simulated'),
    onSuccess: () => qc.invalidateQueries({ queryKey: methodsKey }),
  });
  const search = useMutation({ mutationFn: (requestedDate: string) => sendBookingData<Availability>(`${base}/availability`, { date: requestedDate, items }) });
  const availableDates = useQuery({
    queryKey: [base, 'available-dates', items, weekStart],
    queryFn: () => sendBookingData<{ date: string; available: boolean }[]>(`${base}/available-dates`, { items, from: weekStart }),
  });
  const moveWeek = (days: number) => {
    const next = new Date(weekStart + 'T00:00:00Z');
    next.setUTCDate(next.getUTCDate() + days);
    setWeekStart(next.toISOString().slice(0, 10));
  };
  const waitlist = useMutation({ mutationFn: () => sendBookingData(`${base}/waitlist`, { date }) });
  const confirm = useMutation({
    mutationFn: ({ slot, result }: { slot: Slot; result: Availability }) => sendBookingData<Booking>(`${base}/bookings`, {
      employeeId: slot.employeeId, startsAt: slot.startsAt, items, idempotencyKey: key,
      policyVersion: result.policy?.version, expectedPriceCents: slot.quote?.priceCents ?? result.quote.priceCents,
      paymentMethodId: paymentMethod?.id, acceptPolicy: accepted, expectedEndsAt: slot.endsAt, appointmentNote: appointmentNote.trim() || undefined,
      expectedProfessionals: slot.mixed ? slot.quote?.items.map((line) => line.employeeId) : undefined,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: myBookingsKey }),
  });
  const calendarStatus = availableDates.isError ? 'Der Kalender konnte nicht geladen werden.'
    : availableDates.isPending ? 'Verfügbare Tage werden geladen …'
      : availableDates.data?.some((entry) => entry.available) ? 'Verfügbare Tage wurden geladen.'
        : 'In dieser Woche sind keine Tage verfügbar.';
  const calendarBusy = search.isPending || confirm.isPending || waitlist.isPending;
  const result = search.data;
  const professionals = [...new Map(result?.slots.filter((entry) => !entry.mixed).map((entry) => [entry.employeeId, entry])).values()];
  const eligibleSlots = result?.slots.filter((entry) => !professionalId || (!entry.mixed && entry.employeeId === professionalId)) ?? [];
  const shownSlots = professionalId || !result?.professionalChoice?.any ? eligibleSlots
    : eligibleSlots.filter((entry, index) => !index || eligibleSlots[index - 1]?.startsAt !== entry.startsAt);
  const slot = shownSlots.find((entry) => slotKey(entry) === selected);
  const lines = slot?.quote?.items ?? selectedServices;
  const total = slot?.quote?.priceCents ?? lines.reduce((sum, line) => sum + line.priceCents, 0);
  const treatmentMinutes = lines.reduce((sum, line) => sum + line.durationMinutes, 0);
  if (confirm.isSuccess) return <p className="mt-4" role="status">Termin bestätigt. <Link className="underline" href="/konto">Meine Termine</Link></p>;
  return <div className="mt-5 space-y-4">
    <section aria-label="Buchungsübersicht" className="space-y-2 rounded-xl border border-border bg-muted/40 p-4">
      <p className="font-medium">{lines.length === 1 ? '1 ausgewählte Leistung' : `${lines.length} ausgewählte Leistungen`}</p>
      <ul className="space-y-1 text-sm">{lines.map((line, index) =>
        <li key={index}>{[line.name, line.variantName, line.professionalName, `${line.durationMinutes} Min.`, formatCents(line.priceCents)].filter(Boolean).join(' · ')}</li>)}</ul>
      <p>{slot ? 'Endbetrag' : 'Standardpreis'} · {formatCents(total)} · {treatmentMinutes} Min. Behandlung
        {slot?.quote && ` · ${slot.quote.occupiedMinutes} Min. inkl. Puffer`}</p>
      {slot && <div className="text-sm">
        <p>{business.name} · {business.address}, {business.postalCode} {business.city}</p>
        <p>{appointmentLabel(slot.startsAt, business.timezone)} bis {appointmentLabel(slot.endsAt, business.timezone)}</p>
      </div>}
    </section>
    <section aria-label="Kalender verfügbarer Tage" className="space-y-2">
      <div className="flex flex-wrap gap-4 text-sm">
        <button type="button" className="underline disabled:opacity-50" disabled={weekStart <= dateInZone(business.timezone)}
          onClick={() => moveWeek(-7)}>Vorherige Woche</button>
        <button type="button" className="underline" onClick={() => moveWeek(7)}>Nächste Woche</button>
      </div>
      <p role="status" aria-atomic="true" className="text-sm">
        Woche ab {spokenDate.format(new Date(weekStart))}. {calendarStatus}
      </p>
      {availableDates.isError && <button type="button" className="underline" onClick={() => availableDates.refetch()}>Kalender erneut laden</button>}
      <div className="flex flex-wrap gap-2">{availableDates.data?.map((entry) => (
        <button key={entry.date} type="button" disabled={!entry.available} aria-disabled={calendarBusy || undefined}
          aria-label={spokenDate.format(new Date(entry.date))}
          aria-pressed={date === entry.date} className="rounded-md border border-border px-2 py-1 text-sm aria-pressed:bg-muted disabled:opacity-50 aria-disabled:opacity-50"
          onClick={() => {
            if (calendarBusy) return;
            setDate(entry.date); setSelected(''); setProfessionalId(''); setAccepted(false);
            waitlist.reset(); confirm.reset(); setKey(crypto.randomUUID()); search.mutate(entry.date);
          }}>
          {calendarDate.format(new Date(entry.date))}
        </button>
      ))}</div>
    </section>
    <Field id="booking-date" label="Wunschtermin">
      <input type="date" id="booking-date" className={inputCls} value={date} min={dateInZone(business.timezone)}
        disabled={search.isPending || confirm.isPending || waitlist.isPending}
        onChange={(e) => { setDate(e.target.value); setProfessionalId(''); search.reset(); waitlist.reset(); confirm.reset(); setAccepted(false); setSelected(''); setKey(crypto.randomUUID()); }} />
    </Field>
    <PrimaryButton type="button" testId="booking-search" pending={search.isPending} disabled={!date || confirm.isPending}
      onClick={() => { setSelected(''); setProfessionalId(''); setAccepted(false); confirm.reset(); search.mutate(date); }}>Verfügbarkeit prüfen</PrimaryButton>
    <p role="status" className="sr-only">
      {search.isPending ? 'Termine werden gesucht …' : result?.slots.length ? 'Termine gefunden.' : ''}
    </p>
    {result && <>
      {result.professionalChoice?.individual && professionals.length > 0 && <Field id="booking-professional" label="Fachkraft">
        <select id="booking-professional" className={inputCls} value={professionalId} onChange={(event) => {
          setProfessionalId(event.target.value); setSelected(''); setAccepted(false); setKey(crypto.randomUUID());
        }}>
          <option value="">{result.professionalChoice.any ? 'Beliebige verfügbare Fachkraft' : 'Bitte auswählen'}</option>
          {professionals.map((entry) => <option key={entry.employeeId} value={entry.employeeId}>{entry.employeeName}{entry.professionalTitle ? ` · ${entry.professionalTitle}` : ''}</option>)}
        </select>
      </Field>}
      {slot?.professionalPhotoUrl && !slot.mixed && <img src={slot.professionalPhotoUrl} alt={slot.employeeName} referrerPolicy="no-referrer"
        className="h-16 w-16 rounded-full object-cover" />}
      {shownSlots.length && (result.professionalChoice?.any || professionalId || !result.professionalChoice) ? <SlotPicker slots={shownSlots} zone={business.timezone} selected={selected}
        onChange={(value) => { setSelected(value); setAccepted(false); confirm.reset(); setKey(crypto.randomUUID()); }} />
        : <p role="status">{shownSlots.length ? 'Wähle zuerst eine Fachkraft.' : 'An diesem Tag sind keine Termine verfügbar.'}</p>}
      {!signedIn ? <Link className="underline" href={`/sign-in?redirect_url=${encodeURIComponent(`/salons/${business.slug}`)}`}>Anmelden zum Buchen</Link>
        : !result.slots.length ? <PrimaryButton type="button" testId="booking-waitlist" pending={waitlist.isPending}
          disabled={waitlist.isSuccess} onClick={() => waitlist.mutate()}>{waitlist.isSuccess ? 'Auf der Warteliste' : 'Auf die Warteliste setzen'}</PrimaryButton>
        : result.policy && <>
          {paymentMethod ? <p>Simulierte Zahlungsmethode hinterlegt. Keine Abbuchung.</p>
            : methods.isError ? <button type="button" className="underline" onClick={() => methods.refetch()}>Zahlungsmethoden erneut laden</button>
            : <PrimaryButton type="button" testId="setup-simulated-payment" pending={setupPayment.isPending} disabled={methods.isPending}
              onClick={() => setupPayment.mutate()}>Simulierte Zahlungsmethode hinterlegen</PrimaryButton>}
          <FormStatus error={setupPayment.error ? errorText(setupPayment.error) : null} />
          <Field id="appointment-note" label="Hinweis zum Termin (optional)">
            <textarea id="appointment-note" className={inputCls} maxLength={500} value={appointmentNote}
              onChange={(event) => { setAppointmentNote(event.target.value); setKey(crypto.randomUUID()); }} />
          </Field>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
            <span>Ich akzeptiere die Stornierungsbedingungen. Frist: {result.policy.noticeHours} Stunden.
              Online-Umbuchung: {(result.policy.rescheduleNoticeHours ?? 0) > 0 ? `bis ${result.policy.rescheduleNoticeHours} Stunden vor Terminbeginn.` : "bis zum Terminbeginn."}
              Späte Stornierung: {feeLabel(result.policy.lateFeeType, result.policy.lateFeeValue, slot ? total : undefined)}.
              Nichterscheinen: {feeLabel(result.policy.noShowFeeType, result.policy.noShowFeeValue, slot ? total : undefined)}.
              In dieser Version erfolgt keine automatische Abbuchung.
              {result.policy.exceptions && ` ${result.policy.exceptions}`}</span>
          </label>
          <PrimaryButton type="button" testId="booking-confirm" pending={confirm.isPending} disabled={!slot || !accepted || !paymentMethod}
            onClick={() => { if (slot) confirm.mutate({ slot, result }); }}>Termin bestätigen</PrimaryButton>
        </>}
    </>}
    <FormStatus error={search.error || confirm.error || waitlist.error ? errorText(search.error ?? confirm.error ?? waitlist.error) : null} />
  </div>;
}

function BookingReview({ booking }: { booking: Booking }) {
  const [rating, setRating] = useState('');
  const [comment, setComment] = useState('');
  const client = useQueryClient();
  const review = useMutation({
    mutationFn: () => sendBookingData<{ rating: number }>('/api/me/bookings/' + booking.id + '/review',
      { rating: Number(rating), comment }),
    onSuccess: () => client.invalidateQueries({ queryKey: myBookingsKey }),
  });
  const saved = booking.reviewRating ?? review.data?.rating;
  if (saved) return <p className="text-sm">Deine Bewertung · {saved}/5</p>;
  return <details className="space-y-2">
    <summary className="cursor-pointer text-sm underline">Termin bewerten</summary>
    <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); review.mutate(); }}>
      <label className="block text-sm">Bewertung
        <select className={inputCls} required value={rating} onChange={(event) => setRating(event.target.value)}>
          <option value="">Bitte auswählen</option>
          {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value}/5</option>)}
        </select>
      </label>
      <label className="block text-sm">Öffentlicher Kommentar (optional)
        <textarea className={inputCls} maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} />
      </label>
      <PrimaryButton type="submit" testId={'publish-review-' + booking.id} pending={review.isPending}>Bewertung veröffentlichen</PrimaryButton>
      <FormStatus error={review.error ? errorText(review.error) : null} />
    </form>
  </details>;
}

export function AccountBookings() {
  const list = useQuery({ queryKey: myBookingsKey, refetchInterval: 15000, refetchOnWindowFocus: 'always', queryFn: ({ signal }) => getBookingData<Booking[]>('/api/me/bookings', signal) });
  return <div className="space-y-6"><Panel title="Meine Termine">
    {list.isPending ? <p role="status">Termine werden geladen …</p>
      : list.isError ? <button type="button" className="underline" onClick={() => list.refetch()}>Termine erneut laden</button>
      : list.data.length ? <ul className="divide-y divide-border">{list.data.map((booking) => <BookingRow key={booking.id} booking={booking} />)}</ul>
      : <p>Du hast noch keine Termine.</p>}
  </Panel><CustomerWaitlist /></div>;
}

function PaymentHistoryPanel({ booking }: { booking: Booking }) {
  const [open, setOpen] = useState(false);
  const history = useQuery({
    queryKey: ['my-booking-payment-history', booking.id], enabled: open,
    queryFn: ({ signal }) => getBookingData<MyAppointmentPaymentHistory>('/api/me/bookings/' + booking.id + '/payment-history', signal),
  });
  return <details className="text-sm" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer underline">Zahlungsverlauf</summary>
    {open && history.isPending && <p role="status">Zahlungen werden geladen.</p>}
    {history.isError && <button type="button" className="underline" onClick={() => history.refetch()}>Zahlungen erneut laden</button>}
    {!!history.data?.packageCoveredCents && <p>Mit einem Paket bezahlt · {formatCents(history.data.packageCoveredCents)}</p>}
    {history.data?.payments.length === 0 && !history.data.packageCoveredCents && <p>Keine Zahlungen erfasst.</p>}
    {!!history.data?.payments.length && <ul className="space-y-1">{history.data.payments.map((payment) => <li key={payment.id}>
      <p>{payment.kind === 'deposit' ? 'Anzahlung' : 'Restzahlung'} · {formatCents(payment.amountCents)} ·
        {payment.method === 'cash' ? ' Bar' : ' Simulierte Kartenzahlung'} · {appointmentLabel(payment.createdAt, booking.timezone)}</p>
      {payment.discountCents > 0 && <p>Rabatt {formatCents(payment.discountCents)}</p>}
      {history.data?.refunds.filter(({ paymentId }) => paymentId === payment.id).map((refund) => <p key={refund.id}>
        Erstattung {formatCents(refund.amountCents)} · {appointmentLabel(refund.createdAt, booking.timezone)}
      </p>)}
    </li>)}</ul>}
  </details>;
}

function BookingRow({ booking }: { booking: Booking }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const editorId = useId();
  const editButton = useRef<HTMLButtonElement>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const statusLine = useRef<HTMLParagraphElement>(null);
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    if (editing) dateInput.current?.focus();
  }, [editing]);
  const [date, setDate] = useState(dateInZone(booking.timezone));
  const [selected, setSelected] = useState('');
  const path = `/api/me/bookings/${booking.id}`;
  const calendar = useMutation({ mutationFn: async () => {
    const blob = await customFetch<Blob>(`${path}/calendar.ics`, { responseType: 'blob' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `beautyhub-${booking.id}.ics`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } });
  const cancel = useMutation({ mutationFn: () => sendBookingData(`${path}/cancel`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: myBookingsKey });
      setAnnouncement('Termin storniert.');
      statusLine.current?.focus();
    } });
  const search = useMutation({ mutationFn: () => sendBookingData<Availability>(`${path}/availability`, { date }) });
  const move = useMutation({ mutationFn: (slot: Slot) => sendBookingData(`${path}/reschedule`, {
    startsAt: slot.startsAt, employeeId: slot.employeeId,
  }), onSuccess: async () => {
    await qc.invalidateQueries({ queryKey: myBookingsKey });
    setEditing(false);
    setSelected('');
    search.reset();
    setAnnouncement('Termin umgebucht.');
    editButton.current?.focus();
  } });
  const slot = search.data?.slots.find((entry) => slotKey(entry) === selected);
  const future = booking.status === 'confirmed' && Date.parse(booking.startsAt) > Date.now();
  return <li className="space-y-2 py-3">
    <p ref={statusLine} tabIndex={-1} className="font-medium">{booking.salon} · {statusLabel[booking.status]}</p>
    {booking.status === 'completed' && <BookingReview booking={booking} />}
    <p>{appointmentLabel(booking.startsAt, booking.timezone)} · {formatCents(booking.priceCents)}</p>
    {booking.appointmentNote && <p className="whitespace-pre-wrap break-words text-sm">{booking.appointmentNote}</p>}
    <p className="text-sm">{booking.items.map((item) => [item.name, item.variantName, item.professionalName].filter(Boolean).join(' · ')).join(', ')}</p>
    <PaymentHistoryPanel booking={booking} />
    {(booking.status === 'confirmed' || booking.status === 'cancelled') && <button type="button" className="text-sm underline"
      disabled={calendar.isPending} onClick={() => calendar.mutate()}>
      {booking.status === 'cancelled' ? 'Kalenderstornierung herunterladen' : 'Zum Kalender hinzufügen'}
    </button>}
    {calendar.error && <FormStatus error={errorText(calendar.error)} />}
    {future && <div className="flex gap-4 text-sm">
      <button type="button" className="underline" disabled={cancel.isPending || move.isPending}
        onClick={() => { if (window.confirm('Termin wirklich stornieren?')) cancel.mutate(); }}>Stornieren</button>
      <button ref={editButton} type="button" className="underline" aria-expanded={editing} aria-controls={editorId}
        aria-disabled={cancel.isPending || move.isPending || undefined}
        onClick={() => { if (!cancel.isPending && !move.isPending) setEditing(!editing); }}>Umbuchen</button>
    </div>}
    {future && <div id={editorId} hidden={!editing} className="space-y-3" onKeyDown={(event) => {
      if (event.key !== 'Escape' || move.isPending) return;
      event.preventDefault();
      setEditing(false);
      editButton.current?.focus();
    }}>
      <label className="grid gap-1">Neues Datum
        <input ref={dateInput} type="date" className={inputCls} value={date} min={dateInZone(booking.timezone)} disabled={search.isPending}
          onChange={(e) => { setDate(e.target.value); setSelected(''); search.reset(); }} />
      </label>
      <button type="button" className="underline" disabled={!date} aria-disabled={search.isPending || undefined}
        onClick={() => { if (!search.isPending) search.mutate(); }}>Termine suchen</button>
      {search.data?.slots.length ? <SlotPicker slots={search.data.slots} zone={booking.timezone} selected={selected} onChange={setSelected} />
        : null}
      <PrimaryButton type="button" testId="reschedule-confirm" pending={move.isPending} disabled={!slot}
        onClick={() => { if (slot) move.mutate(slot); }}>Umbuchung bestätigen</PrimaryButton>
    </div>}
    <p role="status" className={editing && search.data && !search.data.slots.length ? 'text-sm' : 'sr-only'}>
      {editing && search.isPending ? 'Termine werden gesucht …'
        : editing && search.data ? search.data.slots.length ? 'Freie Termine gefunden.' : 'Keine freien Termine.'
          : announcement}
    </p>
    <BookingHistory booking={booking} path={path} />
    <FormStatus error={cancel.error || move.error || search.error ? errorText(cancel.error ?? move.error ?? search.error) : null} />
  </li>;
}

function BookingHistory({ booking, path }: { booking: Booking; path: string }) {
  const [open, setOpen] = useState(false);
  const history = useQuery({
    queryKey: [...myBookingsKey, booking.id, 'events', booking.status, booking.startsAt],
    queryFn: ({ signal }) => getBookingData<{ kind: keyof typeof statusLabel | 'rescheduled'; createdAt: string; estimatedFeeCents: number | null }[]>(`${path}/events`, signal),
    enabled: open,
  });
  return <div className="text-sm">
    <button type="button" className="underline" aria-expanded={open} onClick={() => setOpen(!open)}>Verlauf</button>
    {open && (history.isPending ? <p role="status">Verlauf wird geladen …</p>
      : history.isError ? <button type="button" className="ml-3 underline" onClick={() => history.refetch()}>Verlauf erneut laden</button>
      : <ul className="mt-2 space-y-1">{history.data.map((event, index) => <li key={`${event.kind}/${event.createdAt}/${index}`}>
        {appointmentLabel(event.createdAt, booking.timezone)} · {event.kind === 'rescheduled' ? 'Umgebucht' : statusLabel[event.kind]}
        {!!event.estimatedFeeCents && ` · Mögliche Gebühr: ${formatCents(event.estimatedFeeCents)} (keine Abbuchung)`}
      </li>)}</ul>)}
  </div>;
}

function CustomerWaitlist() {
  const path = '/api/me/booking-waitlist';
  const qc = useQueryClient();
  const list = useQuery({ queryKey: [path], refetchInterval: 15000, refetchOnWindowFocus: 'always', queryFn: ({ signal }) =>
    getBookingData<{ locationId: string; salon: string; slug: string; date: string; openedAt: string | null }[]>(path, signal) });
  const remove = useMutation({ mutationFn: ({ locationId, date }: { locationId: string; date: string }) =>
    sendBookingData(`${path}/${locationId}/${date}`, undefined, 'DELETE'),
  onSuccess: () => qc.invalidateQueries({ queryKey: [path] }) });
  if (list.isError) return <button type="button" className="underline" onClick={() => list.refetch()}>Warteliste erneut laden</button>;
  if (!list.data?.length) return null;
  return <Panel title="Meine Warteliste">
    <ul className="space-y-3">{list.data.map((entry) => <li key={`${entry.locationId}/${entry.date}`}>
      <Link href={`/salons/${entry.slug}`} className="underline">{entry.salon}</Link> · {entry.date}
      {entry.openedAt && <p role="status">Die Terminplanung hat sich geändert. Prüfe die aktuelle Verfügbarkeit.</p>}
      <button type="button" disabled={remove.isPending} className="ml-3 text-sm underline" onClick={() => remove.mutate(entry)}>Entfernen</button>
    </li>)}</ul>
    <FormStatus error={remove.error ? errorText(remove.error) : null} />
  </Panel>;
}
