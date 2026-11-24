import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Field, FormStatus, Panel, PrimaryButton, inputCls } from '@/components/forms';
import { getBookingData, sendBookingData } from '@/lib/booking';
import { errorText } from '@/lib/api';
import { formatCents } from '@/lib/format';

const codePattern = /^[A-Z0-9-]{4,32}$/;
type Quote = { code: string; discountCents: number };
const pathFor = (organizationId: string) => '/api/organizations/' + organizationId + '/pos-vouchers';

export function useVoucher(organizationId: string) {
  const [code, setCode] = useState('');
  const lookup = useMutation({ mutationFn: (value: string) => getBookingData<Quote>(pathFor(organizationId) + '/' + encodeURIComponent(value)) });
  const update = (value: string) => { setCode(value.toUpperCase()); lookup.reset(); };
  return { code, update, lookup, quote: lookup.data?.code === code.trim() ? lookup.data : undefined };
}

export function VoucherInput({ voucher, onChange }: { voucher: ReturnType<typeof useVoucher>; onChange: () => void }) {
  const id = useId();
  return <div className="space-y-2">
    <Field id={id} label="Gutscheincode (optional)">
      <input id={id} className={inputCls} maxLength={32} value={voucher.code}
        onChange={(event) => { voucher.update(event.target.value); onChange(); }} />
    </Field>
    {voucher.code && <button type="button" className="text-sm underline" disabled={voucher.lookup.isPending || !codePattern.test(voucher.code.trim())}
      onClick={() => voucher.lookup.mutate(voucher.code.trim())}>Gutschein prüfen</button>}
    {voucher.quote && <p>Gutscheinrabatt {formatCents(voucher.quote.discountCents)}</p>}
    <FormStatus error={voucher.lookup.error ? errorText(voucher.lookup.error) : null} />
  </div>;
}

export function PosVouchers({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState('');
  const path = pathFor(organizationId);
  const vouchers = useQuery({
    queryKey: [path], enabled: open,
    queryFn: ({ signal }) => getBookingData<(Quote & { id: string; isGift: boolean; redeemedAt: string | null; expiresAt: string | null })[]>(path, signal),
  });
  const cents = /^[0-9]{1,8}([.,][0-9]{1,2})?$/.test(amount) ? Math.round(Number(amount.replace(',', '.')) * 100) : 0;
  const issue = useMutation({
    mutationFn: () => sendBookingData(path, { code: code.trim(), discountCents: cents }),
    onSuccess: async () => { setCode(''); setAmount(''); await qc.invalidateQueries({ queryKey: [path] }); },
  });
  const [giftRequest, setGiftRequest] = useState(() => crypto.randomUUID());
  const issueGift = useMutation({
    mutationFn: () => sendBookingData<Quote>(path + '/gifts', { discountCents: cents, requestId: giftRequest }),
    onSuccess: async () => { setAmount(''); setGiftRequest(crypto.randomUUID()); await qc.invalidateQueries({ queryKey: [path] }); },
  });
  return <Panel title="Gutscheine">
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer underline">Gutscheine verwalten</summary>
      <fieldset className="mt-3 space-y-2" disabled={issue.isPending || issueGift.isPending}>
        <Field id="issue-voucher-code" label="Neuer Gutscheincode">
          <input id="issue-voucher-code" className={inputCls} maxLength={32} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} />
        </Field>
        <Field id="issue-voucher-amount" label="Gutscheinrabatt (EUR)">
          <input id="issue-voucher-amount" className={inputCls} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <PrimaryButton type="button" testId="issue-pos-voucher" pending={issue.isPending}
          disabled={!codePattern.test(code.trim()) || cents <= 0 || cents > 2147483647} onClick={() => issue.mutate()}>Gutschein anlegen</PrimaryButton>
        <PrimaryButton type="button" variant="ghost" testId="issue-gift-voucher" pending={issueGift.isPending}
          disabled={cents <= 0 || cents > 100000} onClick={() => issueGift.mutate()}>Geschenkgutschein erstellen</PrimaryButton>
        <p className="text-sm">Geschenkcodes sind übertragbar und einmalig bei einem Einkauf über dem Gutscheinwert einlösbar.</p>
      </fieldset>
      {issueGift.data && <p role="status">Geschenkcode · <code className="break-all select-all">{issueGift.data.code}</code></p>}
      <FormStatus error={issue.error || issueGift.error || vouchers.error ? errorText(issue.error ?? issueGift.error ?? vouchers.error) : null} />
      {!!vouchers.data?.length && <ul className="mt-3 space-y-1 text-sm">
        {vouchers.data.map((voucher) => <li key={voucher.id}>{voucher.isGift ? 'Geschenk · ' : ''}{voucher.code} · {formatCents(voucher.discountCents)} ·
          {voucher.redeemedAt ? ' Eingelöst' : voucher.expiresAt && Date.parse(voucher.expiresAt) <= Date.now() ? ' Abgelaufen' : ' Verfügbar'}
        </li>)}
      </ul>}
    </details>
  </Panel>;
}
