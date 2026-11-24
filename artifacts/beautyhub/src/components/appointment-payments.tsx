import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch, type AppointmentPaymentBalance, type AppointmentPaymentInputMethod, type AppointmentRefund } from '@workspace/api-client-react';
import { useVoucher, VoucherInput } from '@/components/pos-vouchers';
import { Field, FormStatus, PrimaryButton, inputCls } from '@/components/forms';
import { errorText } from '@/lib/api';
import { getBookingData, sendBookingData, type Booking } from '@/lib/booking';
import { formatCents } from '@/lib/format';

const centsFromInput = (value: string) => /^\d{1,8}([.,]\d{1,2})?$/.test(value)
  ? Math.round(Number(value.replace(',', '.')) * 100) : 0;
const methods = { cash: 'Bar', simulated_card: 'Simulierte Kartenzahlung' };

export function AppointmentPayments({ booking, calendarPath, organizationId }: { booking: Booking; calendarPath: string; organizationId: string }) {
  const qc = useQueryClient();
  const voucher = useVoucher(organizationId);
  const refreshDaily = () => qc.invalidateQueries({ queryKey: ["appointment-transactions"] });
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [discount, setDiscount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [method, setMethod] = useState<AppointmentPaymentInputMethod>('cash');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const fieldId = useId();
  const path = calendarPath + '/' + booking.id + '/payments';
  const balance = useQuery({ queryKey: [path], enabled: open, queryFn: ({ signal }) => getBookingData<AppointmentPaymentBalance>(path, signal) });
  const deposit = booking.status === 'confirmed';
  const outstanding = balance.data?.outstandingCents ?? 0;
  const discountCents = deposit ? 0 : centsFromInput(discount);
  const validDiscount = deposit || !discount.trim() || (discountCents > 0 && !!discountReason.trim());
  const cents = deposit ? centsFromInput(amount) : outstanding - (voucher.quote?.discountCents ?? discountCents);
  const record = useMutation({
    mutationFn: () => sendBookingData(path, { idempotencyKey: key, amountCents: cents, method, kind: deposit ? 'deposit' : 'settlement',
      discountCents: discountCents || undefined, discountReason: discountCents ? discountReason.trim() : undefined, voucherCode: deposit ? undefined : voucher.quote?.code }),
    onSuccess: async () => { await Promise.all([balance.refetch(), refreshDaily(), qc.invalidateQueries({ queryKey: ['/api/organizations/' + organizationId + '/pos-vouchers'] })]); voucher.update(''); setKey(crypto.randomUUID()); setAmount(''); setDiscount(''); setDiscountReason(''); },
  });
  const applyPackage = useMutation({
    mutationFn: () => sendBookingData(path + '/package'),
    onSuccess: () => balance.refetch(),
  });
  return <details className="text-sm" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer underline">Zahlungen</summary>
    {open && <div className="mt-2 space-y-2">
      {balance.isPending && <p role="status">Zahlungen werden geladen \u2026</p>}
      {balance.isError && <button type="button" className="underline" onClick={() => balance.refetch()}>Zahlungen erneut laden</button>}
      {balance.data && <>
        <p>Erfasst {formatCents(balance.data.paidCents)}
          {(deposit || booking.status === 'completed') && ' \u00b7 Offen ' + formatCents(outstanding)}
          {!!balance.data.packageCoveredCents && ' · Paket ' + formatCents(balance.data.packageCoveredCents)}
          {balance.data.discountCents > 0 && ' \u00b7 Rabatt ' + formatCents(balance.data.discountCents)}
          {balance.data.refundedCents > 0 && ' \u00b7 Erstattet ' + formatCents(balance.data.refundedCents)}
        </p>
        {!!balance.data.entries.length && <ul className="space-y-1">
          {balance.data.entries.map((entry) => <PaymentEntry key={entry.id} entry={entry}
            refunds={balance.data.refunds.filter((refund) => refund.paymentId === entry.id)}
            path={path + '/' + entry.id} canRefund={!deposit} refresh={() => Promise.all([balance.refetch(), refreshDaily()])} />)}
        </ul>}
        {outstanding > 0 && (deposit || booking.status === 'completed') && <fieldset className="space-y-2" disabled={record.isPending || applyPackage.isPending}>
          {deposit && <Field id={fieldId + '-amount'} label="Anzahlung (EUR)">
            <input id={fieldId + '-amount'} inputMode="decimal" className={inputCls} value={amount}
              onChange={(event) => { setAmount(event.target.value); setKey(crypto.randomUUID()); }} />
          </Field>}
          {!deposit && <>
            {!discount.trim() && <VoucherInput voucher={voucher} onChange={() => setKey(crypto.randomUUID())} />}
            <Field id={fieldId + '-discount'} label="Rabatt (EUR, optional)">
              <input id={fieldId + '-discount'} className={inputCls} inputMode="decimal" value={discount} disabled={!!voucher.code.trim()}
                onChange={(event) => { setDiscount(event.target.value); setKey(crypto.randomUUID()); }} />
            </Field>
            {discountCents > 0 && <Field id={fieldId + '-discount-reason'} label="Rabattgrund">
              <input id={fieldId + '-discount-reason'} className={inputCls} maxLength={240} value={discountReason}
                onChange={(event) => { setDiscountReason(event.target.value); setKey(crypto.randomUUID()); }} />
            </Field>}
            <p>Zahlbetrag {formatCents(Math.max(0, cents))}</p>
          </>}
          <Field id={fieldId + '-method'} label="Zahlungsart">
            <select id={fieldId + '-method'} className={inputCls} value={method}
              onChange={(event) => { setMethod(event.target.value as AppointmentPaymentInputMethod); setKey(crypto.randomUUID()); }}>
              <option value="cash">Bar</option>
              <option value="simulated_card">Simulierte Kartenzahlung</option>
            </select>
          </Field>
          {booking.source === 'online' && !deposit && booking.items.length === 1 && !booking.items[0]?.variantId && !balance.data.entries.length &&
            <PrimaryButton type="button" testId="apply-appointment-package" variant="ghost" pending={applyPackage.isPending}
              onClick={() => applyPackage.mutate()}>Kundenpaket anwenden</PrimaryButton>}
          <PrimaryButton type="button" testId="record-appointment-payment" pending={record.isPending} disabled={!validDiscount || (!deposit && !!voucher.code.trim() && !voucher.quote) || cents <= 0 || cents > outstanding}
            onClick={() => record.mutate()}>{deposit ? 'Anzahlung erfassen' : 'Restzahlung erfassen'}</PrimaryButton>
        </fieldset>}
      </>}
      <FormStatus error={record.error || applyPackage.error ? errorText(record.error ?? applyPackage.error) : null} />
    </div>}
  </details>;
}

function PaymentEntry({ entry, refunds, path, canRefund, refresh }: {
  entry: AppointmentPaymentBalance['entries'][number]; refunds: AppointmentRefund[]; path: string; canRefund: boolean; refresh: () => Promise<unknown>;
}) {
  const fieldId = useId();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const amountCents = centsFromInput(amount);
  const available = entry.amountCents - refunds.reduce((sum, row) => sum + row.amountCents, 0);
  const refund = useMutation({
    mutationFn: () => sendBookingData(path + '/refunds', { idempotencyKey: key, amountCents, reason }),
    onSuccess: async () => { await refresh(); setKey(crypto.randomUUID()); setAmount(''); setReason(''); },
  });
  const receipt = useMutation({ mutationFn: async () => {
    const file = await customFetch<Blob>(path + '/receipt', { responseType: 'blob' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'beautyhub-zahlung-' + entry.id + '.txt';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } });
  return <li className="space-y-2 rounded-md border border-border p-2">
    <p>{entry.kind === 'deposit' ? 'Anzahlung' : 'Restzahlung'} \u00b7 {methods[entry.method]} \u00b7 {formatCents(entry.amountCents)}</p>
    {entry.discountCents > 0 && <p>Rabatt {formatCents(entry.discountCents)} \u00b7 {entry.discountReason}</p>}
    <button type="button" className="underline" disabled={receipt.isPending} onClick={() => receipt.mutate()}>Zahlungsnachweis herunterladen</button>
    {refunds.length > 0 && <ul>{refunds.map((row) => <li key={row.id}>Erstattung {formatCents(row.amountCents)} \u00b7 {row.reason}</li>)}</ul>}
    {canRefund && available > 0 && <details>
      <summary className="cursor-pointer underline">Erstattung erfassen</summary>
      <fieldset className="mt-2 space-y-2" disabled={refund.isPending}>
        <Field id={fieldId + '-amount'} label="Erstattung (EUR)">
          <input id={fieldId + '-amount'} className={inputCls} inputMode="decimal" value={amount}
            onChange={(event) => { setAmount(event.target.value); setKey(crypto.randomUUID()); }} />
        </Field>
        <Field id={fieldId + '-reason'} label="Grund">
          <input id={fieldId + '-reason'} className={inputCls} maxLength={240} value={reason}
            onChange={(event) => { setReason(event.target.value); setKey(crypto.randomUUID()); }} />
        </Field>
        <PrimaryButton type="button" testId="record-appointment-refund" pending={refund.isPending}
          disabled={amountCents <= 0 || amountCents > available || !reason.trim()} onClick={() => refund.mutate()}>Erstattung speichern</PrimaryButton>
      </fieldset>
    </details>}
    <FormStatus error={receipt.error || refund.error ? errorText(receipt.error ?? refund.error) : null} />
  </li>;
}
