import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch, type BusinessWorkspace, type InventoryProduct } from '@workspace/api-client-react';
import { useVoucher, VoucherInput } from '@/components/pos-vouchers';
import { Field, FormStatus, Panel, PrimaryButton, inputCls } from '@/components/forms';
import { errorText } from '@/lib/api';
import { getBookingData, sendBookingData } from '@/lib/booking';
import { formatCents } from '@/lib/format';

const newLine = () => ({ id: crypto.randomUUID(), description: '', price: '', quantity: '1', productId: '' });
type Method = 'cash' | 'simulated_card';
type Sale = { id: string; amountCents: number; locationId: string };

const centsFromInput = (value: string) => /^[0-9]{1,8}([.,][0-9]{1,2})?$/.test(value)
  ? Math.round(Number(value.replace(',', '.')) * 100) : 0;

export function RetailReceipt({ path, saleId }: { path: string; saleId: string }) {
  const download = useMutation({ mutationFn: async () => {
    const file = await customFetch<Blob>(path + '/' + saleId + '/receipt', { responseType: 'blob' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'beautyhub-verkauf-' + saleId + '.txt';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } });
  return <div><button type="button" className="text-sm underline" disabled={download.isPending}
    onClick={() => download.mutate()}>Verkaufsnachweis herunterladen</button>
    <FormStatus error={download.error ? errorText(download.error) : null} />
  </div>;
}

export function RetailCheckout({ workspace }: { workspace: BusinessWorkspace }) {
  const qc = useQueryClient();
  const [locationId, setLocationId] = useState(workspace.locations[0]?.id ?? '');
  const [method, setMethod] = useState<Method>('cash');
  const [lines, setLines] = useState(() => [newLine()]);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const voucher = useVoucher(workspace.id);
  const path = (id: string) => '/api/organizations/' + workspace.id + '/locations/' + id + '/retail-sales';
  const inventoryPath = '/api/organizations/' + workspace.id + '/locations/' + locationId + '/inventory';
  const [open, setOpen] = useState(false);
  const inventory = useQuery({
    queryKey: [inventoryPath], enabled: open && !!locationId,
    queryFn: ({ signal }) => getBookingData<InventoryProduct[]>(inventoryPath, signal),
  });
  const items = lines.map((row) => ({ productId: row.productId || undefined, description: row.description.trim(), unitCents: centsFromInput(row.price), quantity: Number(row.quantity) }));
  const total = items.reduce((sum, row) => sum + row.unitCents * row.quantity, 0) - (voucher.quote?.discountCents ?? 0);
  const valid = Boolean(locationId) && (!voucher.code.trim() || !!voucher.quote) && total > 0 && total <= 2147483647 && items.every((row) =>
    row.description && row.unitCents > 0 && row.unitCents <= 10_000_000 &&
    Number.isInteger(row.quantity) && row.quantity >= 1 && row.quantity <= 100);
  const sale = useMutation({
    mutationFn: () => sendBookingData<Sale>(path(locationId), { items, method, idempotencyKey: key, voucherCode: voucher.quote?.code }),
    onError: () => { if (items.some(({ productId }) => productId)) void inventory.refetch(); },
    onSuccess: async () => {
      setLines([newLine()]);
      voucher.update('');
      setKey(crypto.randomUUID());
      await Promise.all([qc.invalidateQueries({ queryKey: ['appointment-transactions'] }), qc.invalidateQueries({ queryKey: [inventoryPath] }),
        qc.invalidateQueries({ queryKey: ['/api/organizations/' + workspace.id + '/pos-vouchers'] })]);
    },
  });
  const resetRequest = () => { setKey(crypto.randomUUID()); sale.reset(); };
  const updateLine = (id: string, field: 'description' | 'price' | 'quantity', value: string) => {
    setLines((rows) => rows.map((row) => row.id === id ? { ...row, [field]: value } : row));
    resetRequest();
  };
  if (!workspace.locations.length) return null;
  return <Panel title="Warenverkauf">
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer underline">Verkauf erfassen</summary>
      <fieldset className="mt-3 space-y-3" disabled={sale.isPending}>
        <Field id="retail-location" label="Standort">
          <select id="retail-location" className={inputCls} value={locationId}
            onChange={(event) => { setLocationId(event.target.value); setLines([newLine()]); resetRequest(); }}>
            {workspace.locations.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select>
        </Field>
        {inventory.isError && <button type="button" className="text-sm underline" onClick={() => inventory.refetch()}>Lagerartikel erneut laden</button>}
        {lines.map((row) => <div key={row.id} className="grid gap-2 sm:grid-cols-3">
          {!!inventory.data?.some((item) => !item.archived) && <Field id={row.id + '-catalog'} label="Lagerartikel">
            <select id={row.id + '-catalog'} className={inputCls} value={row.productId} onChange={(event) => {
              const item = inventory.data?.find(({ id }) => id === event.target.value);
              setLines((rows) => rows.map((line) => line.id === row.id ? { ...line, productId: item?.id ?? '',
                description: item?.name ?? '', price: item ? String(item.unitCents / 100).replace('.', ',') : '' } : line));
              resetRequest();
            }}>
              <option value="">Freier Artikel</option>
              {inventory.data.filter((item) => !item.archived).map((item) => <option key={item.id} value={item.id} disabled={item.stock < 1}>
                {item.name} · {item.sku} · Bestand {item.stock}
              </option>)}
            </select>
          </Field>}
          <Field id={row.id + '-description'} label="Artikel">
            <input id={row.id + '-description'} className={inputCls} maxLength={120} value={row.description} readOnly={!!row.productId}
              onChange={(event) => updateLine(row.id, 'description', event.target.value)} />
          </Field>
          <Field id={row.id + '-price'} label="Stückpreis (EUR)">
            <input id={row.id + '-price'} className={inputCls} inputMode="decimal" value={row.price} readOnly={!!row.productId}
              onChange={(event) => updateLine(row.id, 'price', event.target.value)} />
          </Field>
          <Field id={row.id + '-quantity'} label="Menge">
            <input id={row.id + '-quantity'} className={inputCls} type="number" min={1} max={100} value={row.quantity}
              onChange={(event) => updateLine(row.id, 'quantity', event.target.value)} />
          </Field>
          {lines.length > 1 && <button className="justify-self-start text-sm underline" type="button"
            onClick={() => { setLines((rows) => rows.filter(({ id }) => id !== row.id)); resetRequest(); }}>Artikel entfernen</button>}
        </div>)}
        <button type="button" className="text-sm underline" disabled={lines.length >= 20}
          onClick={() => { setLines((rows) => [...rows, newLine()]); resetRequest(); }}>Artikel hinzufügen</button>
        <Field id="retail-method" label="Zahlungsart">
          <select id="retail-method" className={inputCls} value={method} onChange={(event) => { setMethod(event.target.value as Method); resetRequest(); }}>
            <option value="cash">Bar</option>
            <option value="simulated_card">Simulierte Kartenzahlung</option>
          </select>
        </Field>
        <VoucherInput voucher={voucher} onChange={resetRequest} />
        <p>Gesamtbetrag {formatCents(Math.max(0, total))}</p>
        <PrimaryButton type="button" testId="record-retail-sale" disabled={!valid} pending={sale.isPending}
          onClick={() => sale.mutate()}>Verkauf speichern</PrimaryButton>
      </fieldset>
      {sale.data && <div className="mt-3"><p role="status">Verkauf erfasst · {formatCents(sale.data.amountCents)}</p>
        <RetailReceipt path={path(sale.data.locationId)} saleId={sale.data.id} /></div>}
      <FormStatus error={sale.error ? errorText(sale.error) : null} />
    </details>
  </Panel>;
}

export function RetailRefund({ path, saleId }: { path: string; saleId: string }) {
  const qc = useQueryClient();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const salePath = path + '/' + saleId;
  const balance = useQuery({
    queryKey: [salePath], enabled: open,
    queryFn: ({ signal }) => getBookingData<{ refundableCents: number; refunds: { id: string; amountCents: number; reason: string }[] }>(salePath, signal),
  });
  const amountCents = centsFromInput(amount);
  const refund = useMutation({
    mutationFn: () => sendBookingData(salePath + '/refunds', { idempotencyKey: key, amountCents, reason }),
    onSuccess: async () => {
      setAmount(''); setReason(''); setKey(crypto.randomUUID());
      await Promise.all([balance.refetch(), qc.invalidateQueries({ queryKey: ['appointment-transactions'] })]);
    },
  });
  return <details onToggle={(event) => setOpen(event.currentTarget.open)} className="text-sm">
    <summary className="cursor-pointer underline">Verkauf erstatten</summary>
    {balance.isPending && open && <p role="status">Erstattungen werden geladen …</p>}
    {balance.isError && <button type="button" className="underline" onClick={() => balance.refetch()}>Erstattungen erneut laden</button>}
    {balance.data && <div className="mt-2 space-y-2">
      <p>Erstattbar {formatCents(balance.data.refundableCents)}</p>
      {balance.data.refunds.map((item) => <p key={item.id}>Erstattung {formatCents(item.amountCents)} · {item.reason}</p>)}
      {balance.data.refundableCents > 0 && <fieldset className="space-y-2" disabled={refund.isPending}>
        <Field id={fieldId + '-amount'} label="Erstattung (EUR)">
          <input id={fieldId + '-amount'} inputMode="decimal" className={inputCls} value={amount}
            onChange={(event) => { setAmount(event.target.value); setKey(crypto.randomUUID()); }} />
        </Field>
        <Field id={fieldId + '-reason'} label="Grund">
          <input id={fieldId + '-reason'} className={inputCls} maxLength={240} value={reason}
            onChange={(event) => { setReason(event.target.value); setKey(crypto.randomUUID()); }} />
        </Field>
        <PrimaryButton type="button" testId="record-retail-refund" pending={refund.isPending}
          disabled={amountCents <= 0 || amountCents > balance.data.refundableCents || !reason.trim()}
          onClick={() => refund.mutate()}>Verkaufserstattung speichern</PrimaryButton>
      </fieldset>}
      <FormStatus error={refund.error ? errorText(refund.error) : null} />
    </div>}
  </details>;
}
