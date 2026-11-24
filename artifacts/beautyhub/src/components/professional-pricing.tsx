import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BusinessWorkspace } from '@workspace/api-client-react';
import { Field, FormStatus, Panel, PrimaryButton, inputCls } from '@/components/forms';
import { errorText } from '@/lib/api';
import { getBookingData, sendBookingData } from '@/lib/booking';

type Settings = {
  differentialPricing: boolean; allowProfessionalChoice: boolean; allowAnyProfessional: boolean;
  staff: { id: string; professionalTitle: string; professionalPhotoUrl: string }[];
  offers: { employeeId: string; serviceId: string; variantId: string | null; priceCents: number | null; durationMinutes: number | null }[];
};

export function ProfessionalPricingSettings({ workspace }: { workspace: BusinessWorkspace }) {
  const [locationId, setLocationId] = useState(workspace.locations[0]?.id ?? '');
  return <Panel title="Fachkräfte und individuelle Preise">
    <Field id="pricing-location" label="Preisstandort">
      <select id="pricing-location" className={inputCls} value={locationId} onChange={(event) => setLocationId(event.target.value)}>
        {workspace.locations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}
      </select>
    </Field>
    {locationId && <LocationPricing key={locationId} workspace={workspace} locationId={locationId} />}
  </Panel>;
}

function LocationPricing({ workspace, locationId }: { workspace: BusinessWorkspace; locationId: string }) {
  const path = `/api/organizations/${workspace.id}/locations/${locationId}/professional-pricing`;
  const qc = useQueryClient();
  const list = useQuery({ queryKey: [path], queryFn: ({ signal }) => getBookingData<Settings>(path, signal) });
  const [employeeId, setEmployeeId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [variantId, setVariantId] = useState('');
  const selectedEmployee = list.data?.staff.find((entry) => entry.id === employeeId);
  const choices = workspace.services.filter((service) => service.locationId === locationId && !service.archived && service.employeeIds.includes(employeeId));
  const selectedService = choices.find((service) => service.id === serviceId);
  const price = list.data?.offers.find((offer) => offer.employeeId === employeeId && offer.serviceId === serviceId && offer.variantId === (variantId || null));
  const save = useMutation({
    mutationFn: ({ part, data }: { part: string; data: object }) => sendBookingData(path + part, data, 'PUT'),
    onSuccess: () => qc.invalidateQueries({ queryKey: [path] }),
  });
  const form = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); return new FormData(event.currentTarget); };
  if (list.isPending) return <p role="status">Einstellungen werden geladen …</p>;
  if (list.isError) return <button type="button" className="underline" onClick={() => list.refetch()}>Einstellungen erneut laden</button>;
  const settings = list.data;
  return <div className="mt-4 space-y-5">
    <form className="space-y-2" key={list.dataUpdatedAt} onSubmit={(event) => {
      const data = form(event);
      save.mutate({ part: '', data: { differentialPricing: data.has('differential'), allowProfessionalChoice: data.has('individual'), allowAnyProfessional: data.has('any') } });
    }}>
      <label className="flex gap-2"><input type="checkbox" name="differential" defaultChecked={settings.differentialPricing} /> Individuelle Preise und Dauer anwenden</label>
      <label className="flex gap-2"><input type="checkbox" name="individual" defaultChecked={settings.allowProfessionalChoice} /> Auswahl einer bestimmten Fachkraft erlauben</label>
      <label className="flex gap-2"><input type="checkbox" name="any" defaultChecked={settings.allowAnyProfessional} /> Automatische Zuteilung anbieten</label>
      <PrimaryButton testId="save-professional-options" disabled={save.isPending}>Auswahl speichern</PrimaryButton>
    </form>
    <Field id="pricing-employee" label="Fachkraft">
      <select id="pricing-employee" className={inputCls} value={employeeId} onChange={(event) => {
        setEmployeeId(event.target.value); setServiceId(''); setVariantId('');
      }}>
        <option value="">Fachkraft auswählen</option>
        {settings.staff.map((entry) => <option key={entry.id} value={entry.id}>{workspace.employees.find(({ id }) => id === entry.id)?.displayName}</option>)}
      </select>
    </Field>
    {selectedEmployee && <>
      <form className="space-y-2" key={`${employeeId}/${list.dataUpdatedAt}`} onSubmit={(event) => {
        const data = form(event);
        save.mutate({ part: `/employees/${employeeId}`, data: { professionalTitle: data.get('title'), professionalPhotoUrl: data.get('photo') } });
      }}>
        <label className="grid gap-1">Berufsbezeichnung<input className={inputCls} name="title" defaultValue={selectedEmployee.professionalTitle} maxLength={100} /></label>
        <label className="grid gap-1">Foto-URL (HTTPS)<input className={inputCls} type="url" name="photo" defaultValue={selectedEmployee.professionalPhotoUrl} maxLength={1000} /></label>
        <PrimaryButton testId="save-professional-profile" disabled={save.isPending}>Fachprofil speichern</PrimaryButton>
      </form>
      <Field id="pricing-service" label="Zugeordnete Leistung">
        <select id="pricing-service" className={inputCls} value={serviceId} onChange={(event) => { setServiceId(event.target.value); setVariantId(''); }}>
          <option value="">Leistung auswählen</option>
          {choices.map((service) => <option value={service.id} key={service.id}>{service.name}</option>)}
        </select>
      </Field>
      {selectedService && <>
        <Field id="pricing-variant" label="Variante">
          <select id="pricing-variant" className={inputCls} value={variantId} onChange={(event) => setVariantId(event.target.value)}>
            <option value="">Standardleistung</option>
            {selectedService.variants.map((variant) => <option value={variant.id} key={variant.id}>{variant.name}</option>)}
          </select>
        </Field>
        <form className="space-y-2" key={`${employeeId}/${serviceId}/${variantId}/${list.dataUpdatedAt}`} onSubmit={(event) => {
          const data = form(event);
          save.mutate({ part: '/overrides', data: { employeeId, serviceId, variantId: variantId || null,
            priceCents: data.get('price') === '' ? null : Math.round(Number(data.get('price')) * 100),
            durationMinutes: data.get('duration') === '' ? null : Number(data.get('duration')) } });
        }}>
          <label className="grid gap-1">Preis in EUR<input className={inputCls} type="number" name="price" min={0} max={100000} step={0.01}
            defaultValue={price?.priceCents == null ? '' : price.priceCents / 100} /></label>
          <label className="grid gap-1">Dauer in Minuten<input className={inputCls} type="number" name="duration" min={1} max={720} step={1}
            defaultValue={price?.durationMinutes ?? ''} /></label>
          <p className="text-sm text-muted-foreground">Leere Felder verwenden den Standardwert der ausgewählten Leistung oder Variante.</p>
          <PrimaryButton testId="save-professional-override" disabled={save.isPending}>Preis und Dauer speichern</PrimaryButton>
        </form>
      </>}
    </>}
    <FormStatus error={save.error ? errorText(save.error) : null} />
  </div>;
}
