import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Field, FormStatus, PrimaryButton, inputCls } from '@/components/forms';
import { appointmentLabel, getBookingData, sendBookingData } from '@/lib/booking';
import { formatCents } from "@/lib/format";
import { errorText } from '@/lib/api';

type Supplier = { id: string; name: string; email: string; phone: string };
type Product = { id: string; name: string; sku: string; archived: boolean };
type Order = { id: string; supplierName: string; status: 'open' | 'received' | 'cancelled'; createdAt: string;
  items: { productId: string; name: string; sku: string; quantity: number; receivedQuantity?: number; purchaseCostCents?: number | null }[] };
const blankSupplier = { name: '', email: '', phone: '' };
const newLine = () => ({ id: crypto.randomUUID(), productId: '', quantity: '1' });
const labels = { open: 'Offen', received: 'Eingegangen', cancelled: 'Storniert' };

export function InventoryPurchasing({ path, products, timezone }: { path: string; products: Product[]; timezone: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState('');
  const [supplier, setSupplier] = useState(blankSupplier);
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState(() => [newLine()]);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const suppliersPath = path + '/suppliers';
  const ordersPath = path + '/purchase-orders';
  const suppliers = useQuery({ queryKey: [suppliersPath], enabled: open, queryFn: ({ signal }) => getBookingData<Supplier[]>(suppliersPath, signal) });
  const orders = useQuery({ queryKey: [ordersPath], enabled: open, queryFn: ({ signal }) => getBookingData<Order[]>(ordersPath, signal) });
  const saveSupplier = useMutation({
    mutationFn: () => sendBookingData<Supplier>(editing ? suppliersPath + '/' + editing : suppliersPath, supplier, editing ? 'PUT' : 'POST'),
    onSuccess: async (row) => {
      setSupplier(blankSupplier); setEditing(''); setSupplierId(row.id); setKey(crypto.randomUUID());
      await suppliers.refetch();
    },
  });
  const create = useMutation({
    mutationFn: () => sendBookingData(ordersPath, { idempotencyKey: key, supplierId, items: lines.map(({ productId, quantity }) =>
      ({ productId, quantity: Number(quantity) })) }),
    onSuccess: async () => { setLines([newLine()]); setKey(crypto.randomUUID()); await orders.refetch(); },
  });
  const refresh = async () => {
    await Promise.all([orders.refetch(), qc.invalidateQueries({ predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === 'string' && (key === path || (key.startsWith(path + '/') && key.endsWith('/movements')));
    } })]);
  };
  const close = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'received' | 'cancelled' }) => sendBookingData(ordersPath + '/' + id + '/status', { status }),
    onSuccess: refresh,
  });
  const active = products.filter(({ archived }) => !archived);
  const valid = !!supplierId && new Set(lines.map(({ productId }) => productId)).size === lines.length &&
    lines.every(({ productId, quantity }) => active.some(({ id }) => id === productId) &&
      /^[0-9]{1,7}$/.test(quantity) && Number(quantity) > 0 && Number(quantity) <= 1_000_000);
  const fieldLabels = { name: 'Lieferantenname', email: 'E-Mail des Lieferanten', phone: 'Telefon des Lieferanten' };
  return <details className="mt-6 rounded-lg border border-border p-3" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer font-semibold">Lieferanten und Bestellungen</summary>
    <div className="mt-4 space-y-6">
      <section className="space-y-2">
        <h3 className="font-medium">Lieferanten</h3>
        {!!suppliers.data?.length && <ul className="space-y-1 text-sm">{suppliers.data.map((row) =>
          <li key={row.id} className="flex flex-wrap justify-between gap-2">
            <span>{[row.name, row.email, row.phone].filter(Boolean).join(' · ')}</span>
            <button type="button" className="underline" disabled={saveSupplier.isPending}
              onClick={() => { setEditing(row.id); setSupplier({ name: row.name, email: row.email, phone: row.phone }); }}>Lieferant bearbeiten</button>
          </li>)}</ul>}
        <fieldset className="grid gap-2 sm:grid-cols-2" disabled={saveSupplier.isPending}>
          {(Object.keys(fieldLabels) as (keyof typeof fieldLabels)[]).map((field) => <Field key={field} id={'inventory-supplier-' + field} label={fieldLabels[field]}>
            <input id={'inventory-supplier-' + field} className={inputCls} value={supplier[field]}
              type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
              maxLength={field === 'phone' ? 30 : field === 'name' ? 120 : 254}
              onChange={(event) => setSupplier({ ...supplier, [field]: event.target.value })} />
          </Field>)}
          <PrimaryButton type="button" testId="save-inventory-supplier" disabled={!supplier.name.trim()}
            pending={saveSupplier.isPending} onClick={() => saveSupplier.mutate()}>{editing ? 'Lieferant speichern' : 'Lieferant anlegen'}</PrimaryButton>
          {editing && <button type="button" className="underline" onClick={() => { setEditing(''); setSupplier(blankSupplier); }}>Bearbeitung abbrechen</button>}
        </fieldset>
      </section>
      <section className="space-y-2">
        <h3 className="font-medium">Bestellungen</h3>
        <fieldset className="space-y-2" disabled={create.isPending}>
          <Field id="order-supplier" label="Lieferant der Bestellung">
            <select id="order-supplier" className={inputCls} value={supplierId} onChange={(event) => { setSupplierId(event.target.value); setKey(crypto.randomUUID()); }}>
              <option value="">Lieferant auswählen</option>
              {suppliers.data?.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </Field>
          {lines.map((line) => <div key={line.id} className="grid gap-2 sm:grid-cols-2">
            <Field id={line.id + '-product'} label="Bestellartikel">
              <select id={line.id + '-product'} className={inputCls} value={line.productId}
                onChange={(event) => {
                  setLines((rows) => rows.map((row) => row.id === line.id ? { ...row, productId: event.target.value } : row)); setKey(crypto.randomUUID());
                }}>
                <option value="">Artikel auswählen</option>
                {active.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.sku}</option>)}
              </select>
            </Field>
            <Field id={line.id + '-quantity'} label="Bestellmenge">
              <input id={line.id + '-quantity'} className={inputCls} type="number" min={1} max={1_000_000} value={line.quantity}
                onChange={(event) => {
                  setLines((rows) => rows.map((row) => row.id === line.id ? { ...row, quantity: event.target.value } : row)); setKey(crypto.randomUUID());
                }} />
            </Field>
            {lines.length > 1 && <button type="button" className="text-sm underline" onClick={() => {
              setLines((rows) => rows.filter((row) => row.id !== line.id)); setKey(crypto.randomUUID());
            }}>Bestellartikel entfernen</button>}
          </div>)}
          <div className="flex flex-wrap gap-3">
            <button type="button" className="text-sm underline" disabled={lines.length >= 30} onClick={() => {
              setLines((rows) => [...rows, newLine()]); setKey(crypto.randomUUID());
            }}>Bestellartikel hinzufügen</button>
            <PrimaryButton type="button" testId="create-inventory-order" disabled={!valid}
              pending={create.isPending} onClick={() => create.mutate()}>Bestellung anlegen</PrimaryButton>
          </div>
        </fieldset>
        {orders.data?.length === 0 && <p className="text-sm">Keine Bestellungen an diesem Standort.</p>}
        {!!orders.data?.length && <ul className="divide-y divide-border text-sm">{orders.data.map((row) =>
          <li key={row.id} className="space-y-2 py-3">
            <p className="font-medium">{row.supplierName} · {labels[row.status]} · {appointmentLabel(row.createdAt, timezone)}</p>
            <ul className="space-y-1">{row.items.map((item) => <li key={item.productId}>
              {item.name} ({item.sku}) · Eingegangen {item.receivedQuantity ?? (row.status === 'received' ? item.quantity : 0)} / {item.quantity}
              {item.purchaseCostCents != null && ' · Einkaufspreis ' + formatCents(item.purchaseCostCents)}
            </li>)}</ul>
            {row.status === 'open' && <>
              <div className="flex flex-wrap gap-3">
                <button type="button" className="underline" disabled={close.isPending}
                  onClick={() => close.mutate({ id: row.id, status: 'received' })}>Vollständigen Wareneingang buchen</button>
                <button type="button" className="underline" disabled={close.isPending}
                  onClick={() => close.mutate({ id: row.id, status: 'cancelled' })}>Offene Bestellung stornieren</button>
              </div>
              <PartialReceipt order={row} path={ordersPath + '/' + row.id + '/receipts'} refresh={refresh} />
            </>}
          </li>)}</ul>}
      </section>
      {(suppliers.isError || orders.isError) && <button type="button" className="underline"
        onClick={() => Promise.all([suppliers.refetch(), orders.refetch()])}>Einkaufsdaten erneut laden</button>}
      <FormStatus error={saveSupplier.error || create.error || close.error ? errorText(saveSupplier.error ?? create.error ?? close.error) : null} />
    </div>
  </details>;
}

function PartialReceipt({ order, path, refresh }: { order: Order; path: string; refresh: () => Promise<void> }) {
  const id = useId();
  const [values, setValues] = useState<Record<string, string>>({});
  const [key, setKey] = useState(() => crypto.randomUUID());
  const outstanding = order.items.map((line) => ({ ...line, remaining: line.quantity - (line.receivedQuantity ?? 0) }))
    .filter(({ remaining }) => remaining > 0);
  const quantities = outstanding.map((line) => ({ ...line, value: Number(values[line.productId] || 0) }));
  const items = quantities.filter(({ value }) => value > 0).map(({ productId, value }) => ({ productId, quantity: value }));
  const valid = items.length > 0 && quantities.every(({ value, remaining }) => Number.isInteger(value) && value >= 0 && value <= remaining);
  const receive = useMutation({
    mutationFn: () => sendBookingData(path, { idempotencyKey: key, items }),
    onSuccess: async () => { setValues({}); setKey(crypto.randomUUID()); await refresh(); },
  });
  return <details>
    <summary className="cursor-pointer underline">Teillieferung erfassen</summary>
    <fieldset className="mt-2 space-y-2" disabled={receive.isPending}>
      {outstanding.map((line) => <Field key={line.productId} id={id + line.productId} label={line.name + ' · offen ' + line.remaining}>
        <input id={id + line.productId} type="number" min={0} max={line.remaining} className={inputCls}
          value={values[line.productId] ?? ''} onChange={(event) => {
            setValues({ ...values, [line.productId]: event.target.value }); setKey(crypto.randomUUID());
          }} />
      </Field>)}
      <PrimaryButton type="button" testId="record-partial-receipt" pending={receive.isPending} disabled={!valid}
        onClick={() => receive.mutate()}>Teillieferung buchen</PrimaryButton>
    </fieldset>
    <FormStatus error={receive.error ? errorText(receive.error) : null} />
  </details>;
}
