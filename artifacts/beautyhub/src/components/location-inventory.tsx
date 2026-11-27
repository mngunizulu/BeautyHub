import { getGetManagedGalleryImageUrl } from '@workspace/api-client-react';
import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { BusinessWorkspace, InventoryMovement as Movement, InventoryProduct as Product } from '@workspace/api-client-react';
import { InventoryPurchasing } from '@/components/inventory-purchasing';
import { Field, FormStatus, Panel, PrimaryButton, inputCls } from '@/components/forms';
import { appointmentLabel, getBookingData, sendBookingData } from '@/lib/booking';
import { errorText } from '@/lib/api';
import { formatCents } from '@/lib/format';

export function LocationInventory({ workspace }: { workspace: BusinessWorkspace }) {
  const [locationId, setLocationId] = useState(workspace.locations[0]?.id ?? '');
  const location = workspace.locations.find(({ id }) => id === locationId) ?? workspace.locations[0];
  if (!location) return <Panel title="Lager"><p>Lege zuerst einen Standort an.</p></Panel>;
  return <Panel title="Lager">
    <Field id="inventory-location" label="Standort">
      <select id="inventory-location" className={inputCls} value={location.id} onChange={(event) => setLocationId(event.target.value)}>
        {workspace.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
      </select>
    </Field>
    <ProductList key={location.id} organizationId={workspace.id} locationId={location.id} timezone={location.timezone} path={'/api/organizations/' + workspace.id + '/locations/' + location.id + '/inventory'} />
  </Panel>;
}

function ProductList({ path, timezone, organizationId, locationId }: { path: string; timezone: string; organizationId: string; locationId: string }) {
  const [editing, setEditing] = useState<string | 'new'>();
  const products = useQuery({ queryKey: [path], queryFn: ({ signal }) => getBookingData<Product[]>(path, signal) });
  const selected = products.data?.find(({ id }) => id === editing);
  return <div className="mt-4 space-y-4">
    {products.data && <InventoryReport products={products.data} />}
    <InventoryPurchasing path={path} products={products.data ?? []} timezone={timezone} />
    <button type="button" className="underline" onClick={() => setEditing('new')}>Artikel anlegen</button>
    {editing && (editing === 'new' || selected) && <ProductEditor key={editing} path={path} product={selected}
      onCancel={() => setEditing(undefined)} onSave={async () => { await products.refetch(); setEditing(undefined); }} />}
    {products.isPending && <p role="status">Artikel werden geladen.</p>}
    {products.isError && <button type="button" className="underline" onClick={() => products.refetch()}>Artikel erneut laden</button>}
    {products.data?.length === 0 && <p>Keine Artikel an diesem Standort.</p>}
    {!!products.data?.length && <ul className="divide-y divide-border">
      {products.data.map((product) => <li key={product.id} className="space-y-2 py-3">
        <div className="flex flex-wrap items-start gap-3">
          {(product.photoId || product.imageUrl) && <img src={product.photoId ? getGetManagedGalleryImageUrl(organizationId, locationId, product.photoId) : product.imageUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="size-12 rounded object-cover" />}
          <div>
            <p className="font-semibold">{product.name} · {product.sku}</p>
            <p className="text-sm">{[product.category, product.supplier, formatCents(product.unitCents)].filter(Boolean).join(' · ')}</p>
            <p className="text-sm">Bestand {product.stock}{product.archived ? ' · Archiviert' : product.stock <= product.reorderAt ? ' · Niedriger Bestand' : ''}</p>
          </div>
          <button type="button" className="ml-auto text-sm underline" onClick={() => setEditing(product.id)}>Bearbeiten</button>
        </div>
        <MovementPanel product={product} timezone={timezone} path={path + '/' + product.id + '/movements'} refresh={() => products.refetch()} />
      </li>)}
    </ul>}
  </div>;
}

function ProductEditor({ path, product, onCancel, onSave }: {
  path: string; product?: Product; onCancel: () => void; onSave: () => Promise<void>;
}) {
  const [fields, setFields] = useState({
    sku: product?.sku ?? '', name: product?.name ?? '', category: product?.category ?? '',
    supplier: product?.supplier ?? '', imageUrl: product?.imageUrl ?? '',
    purchaseCost: product?.purchaseCostCents == null ? '' : String(product.purchaseCostCents / 100).replace('.', ','),
    price: product ? String(product.unitCents / 100).replace('.', ',') : '',
    reorderAt: String(product?.reorderAt ?? 0), archived: product?.archived ?? false,
  });
  const id = useId();
  const unitCents = /^[0-9]{1,6}([.,][0-9]{1,2})?$/.test(fields.price) ? Math.round(Number(fields.price.replace(',', '.')) * 100) : 0;
  const validCost = !fields.purchaseCost.trim() || (/^[0-9]{1,6}([.,][0-9]{1,2})?$/.test(fields.purchaseCost) &&
    Number(fields.purchaseCost.replace(',', '.')) <= 100_000);
  const purchaseCostCents = fields.purchaseCost.trim() ? Math.round(Number(fields.purchaseCost.replace(',', '.')) * 100) : null;
  const save = useMutation({ mutationFn: () => sendBookingData(product ? path + '/' + product.id : path, {
    sku: fields.sku, name: fields.name, category: fields.category, supplier: fields.supplier,
    imageUrl: fields.imageUrl, unitCents, purchaseCostCents, reorderAt: Number(fields.reorderAt), archived: fields.archived,
  }, product ? 'PUT' : 'POST'), onSuccess: onSave });
  const submit = (event: FormEvent) => { event.preventDefault(); if (valid) save.mutate(); };
  const labels = { sku: 'Artikelnummer', name: 'Name', category: 'Kategorie', supplier: 'Lieferant',
    imageUrl: 'Bild-URL (HTTPS)', price: 'Stückpreis (EUR)', purchaseCost: 'Einkaufspreis (EUR, optional)', reorderAt: 'Meldebestand' };
  const valid = validCost && /^[a-z0-9][a-z0-9._-]{0,39}$/i.test(fields.sku.trim()) && !!fields.name.trim() &&
    unitCents > 0 && unitCents <= 10_000_000 && /^[0-9]{1,7}$/.test(fields.reorderAt) && Number(fields.reorderAt) <= 1_000_000;
  return <form onSubmit={submit} className="rounded-lg border border-border p-3">
    <fieldset disabled={save.isPending} className="grid gap-3 sm:grid-cols-2">
      {(Object.keys(labels) as (keyof typeof labels)[]).map((field) =>
        <Field key={field} id={id + field} label={labels[field]}>
          <input id={id + field} className={inputCls} value={fields[field]}
            inputMode={field === 'price' || field === 'purchaseCost' ? 'decimal' : field === 'reorderAt' ? 'numeric' : undefined}
            maxLength={field === 'imageUrl' ? 500 : field === 'sku' ? 40 : 120}
            onChange={(event) => setFields({ ...fields, [field]: event.target.value })} />
        </Field>)}
      {product && <label className="flex items-center gap-2"><input type="checkbox" checked={fields.archived}
        onChange={(event) => setFields({ ...fields, archived: event.target.checked })} /> Archivieren</label>}
      <div className="flex gap-3 sm:col-span-2">
        <PrimaryButton type="submit" testId="save-inventory-product" disabled={!valid} pending={save.isPending}>Artikel speichern</PrimaryButton>
        <button type="button" className="underline" onClick={onCancel}>Abbrechen</button>
      </div>
    </fieldset>
    <FormStatus error={save.error ? errorText(save.error) : null} />
  </form>;
}

function MovementPanel({ product, path, refresh, timezone }: { product: Product; path: string; timezone: string; refresh: () => Promise<unknown> }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'receipt' | 'adjustment'>('receipt');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const history = useQuery({ queryKey: [path], enabled: open, queryFn: ({ signal }) => getBookingData<Movement[]>(path, signal) });
  const update = useMutation({
    mutationFn: () => sendBookingData(path, { kind, reason, quantity: Number(quantity), idempotencyKey: key }),
    onSuccess: async () => { setQuantity(''); setReason(''); setKey(crypto.randomUUID()); await Promise.all([history.refetch(), refresh()]); },
  });
  const valid = /^-?[0-9]{1,7}$/.test(quantity) && Math.abs(Number(quantity)) <= 1_000_000 &&
    (kind === 'receipt' ? Number(quantity) > 0 : Number(quantity) !== 0) && !!reason.trim();
  return <details onToggle={(event) => setOpen(event.currentTarget.open)} className="text-sm">
    <summary className="cursor-pointer underline">Lagerbewegungen</summary>
    {!product.archived && <fieldset className="mt-3 space-y-2" disabled={update.isPending}>
      <Field id={id + 'kind'} label="Art">
        <select id={id + 'kind'} className={inputCls} value={kind}
          onChange={(event) => { setKind(event.target.value as 'receipt' | 'adjustment'); setKey(crypto.randomUUID()); }}>
          <option value="receipt">Wareneingang</option><option value="adjustment">Korrektur</option>
        </select>
      </Field>
      <Field id={id + 'quantity'} label={kind === 'receipt' ? 'Menge' : 'Mengenänderung (+/-)'}>
        <input id={id + 'quantity'} type="number" className={inputCls} value={quantity}
          onChange={(event) => { setQuantity(event.target.value); setKey(crypto.randomUUID()); }} />
      </Field>
      <Field id={id + 'reason'} label="Grund oder Referenz">
        <input id={id + 'reason'} maxLength={240} className={inputCls} value={reason}
          onChange={(event) => { setReason(event.target.value); setKey(crypto.randomUUID()); }} />
      </Field>
      <PrimaryButton type="button" testId="record-inventory-movement" pending={update.isPending} disabled={!valid}
        onClick={() => update.mutate()}>Bewegung buchen</PrimaryButton>
    </fieldset>}
    {history.isError && <button type="button" className="underline" onClick={() => history.refetch()}>Lagerbewegungen erneut laden</button>}
    {!!history.data?.length && <ul className="mt-3 space-y-1">{history.data.map((entry) =>
      <li key={entry.id}>{entry.kind === 'receipt' ? 'Wareneingang' : entry.kind === 'sale' ? 'Verkauf' : 'Korrektur'} · {entry.quantity} · Bestand {entry.balance} · {entry.reason} \u00b7 {appointmentLabel(entry.createdAt, timezone)}</li>)}</ul>}
    <FormStatus error={update.error ? errorText(update.error) : null} />
  </details>;
}

const unitsFormatter = new Intl.NumberFormat('de-DE');
function formatInventoryValue(cents: bigint) {
  return unitsFormatter.format(cents / 100n) + ',' + String(cents % 100n).padStart(2, '0') + ' EUR';
}

function InventoryReport({ products }: { products: Product[] }) {
  const lowStock = products.filter((product) => !product.archived && product.stock <= product.reorderAt);
  const { units, unpricedUnits, value } = products.reduce((total, product) => {
    const stock = BigInt(product.stock);
    total.units += stock;
    if (product.purchaseCostCents == null) total.unpricedUnits += stock;
    else total.value += stock * BigInt(product.purchaseCostCents);
    return total;
  }, { units: 0n, unpricedUnits: 0n, value: 0n });
  return <section aria-label="Bestandsbericht" className="space-y-3 rounded-lg border border-border p-3">
    <h3 className="font-medium">Bestandsbericht</h3>
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div><dt>Einheiten am Standort</dt><dd className="font-semibold">{unitsFormatter.format(units)}</dd></div>
      <div><dt>Bestandswert zu erfassten Einkaufspreisen</dt><dd className="font-semibold">{formatInventoryValue(value)}</dd></div>
      <div><dt>Einheiten ohne Einkaufspreis</dt><dd className="font-semibold">{unitsFormatter.format(unpricedUnits)}</dd></div>
      <div><dt>Artikel am oder unter Meldebestand</dt><dd className="font-semibold">{lowStock.length}</dd></div>
    </dl>
    {!!lowStock.length && <ul className="space-y-1 text-sm">{lowStock.map((product) => <li key={product.id}>
      {product.name} ({product.sku}) · Bestand {product.stock} / Meldebestand {product.reorderAt}
    </li>)}</ul>}
  </section>;
}
