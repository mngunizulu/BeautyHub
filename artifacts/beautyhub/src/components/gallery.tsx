import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  deleteGalleryPhoto, getGetBusinessQueryKey, getGetGalleryAssignmentsQueryKey, getGetManagedGalleryImageUrl, getGetPublicGalleryImageUrl, getListManagedGalleryQueryKey,
  getListBusinessesQueryKey, getListPublicGalleryQueryKey, saveGalleryAssignment, uploadGalleryPhoto, useGetGalleryAssignments, useListManagedGallery, useListPublicGallery,
  type BusinessWorkspace, type GalleryAssignmentInput, type GalleryPhoto,
} from '@workspace/api-client-react';
import { Field, FormStatus, Panel, PrimaryButton, inputCls } from '@/components/forms';
import { errorText } from '@/lib/api';

export function PublicGallery({ slug }: { slug: string }) {
  const gallery = useListPublicGallery(slug);
  if (gallery.isError) return <button type="button" className="mt-6 underline" onClick={() => gallery.refetch()}>Fotos erneut laden</button>;
  if (!gallery.data?.length) return null;
  return (
    <section className="mt-10" aria-labelledby="gallery-heading">
      <h2 id="gallery-heading" className="font-display text-3xl">Galerie</h2>
      <ul className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
        {gallery.data.map((photo) => (
          <li key={photo.id}>
            <img src={getGetPublicGalleryImageUrl(photo.id)} alt={photo.alt}
              loading="lazy" className="aspect-[4/3] w-full rounded-xl border border-border object-cover" />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GalleryPanel({ ws }: { ws: BusinessWorkspace }) {
  const [selectedLocation, setSelectedLocation] = useState('');
  const location = ws.locations.find((item) => item.id === selectedLocation) ?? ws.locations[0];
  if (!location) return <Panel title="Galerie"><p>Lege zuerst einen Standort an, um Bilder hochzuladen.</p></Panel>;
  return (
    <Panel title="Galerie" kicker="Fotos pro Standort">
      <Field id="gallery-location" label="Standort">
        <select id="gallery-location" className={inputCls} value={location.id} onChange={(e) => setSelectedLocation(e.target.value)}>
          {ws.locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </Field>
      <GalleryEditor key={location.id} organizationId={ws.id} locationId={location.id} slug={location.slug} />
    </Panel>
  );
}

function GalleryEditor({ organizationId, locationId, slug }: { organizationId: string; locationId: string; slug: string }) {
  const qc = useQueryClient();
  const gallery = useListManagedGallery(organizationId, locationId);
  const assignments = useGetGalleryAssignments(organizationId, locationId);
  const [validation, setValidation] = useState<string | null>(null);
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: getListManagedGalleryQueryKey(organizationId, locationId) }),
    qc.invalidateQueries({ queryKey: getListPublicGalleryQueryKey(slug) }),
    qc.invalidateQueries({ queryKey: getGetGalleryAssignmentsQueryKey(organizationId, locationId) }),
    qc.invalidateQueries({ queryKey: getGetBusinessQueryKey(slug) }),
    qc.invalidateQueries({ queryKey: getListBusinessesQueryKey() }),
    qc.invalidateQueries({ queryKey: [`/api/organizations/${organizationId}/locations/${locationId}/inventory`] }),
  ]);
  const upload = useMutation({
    mutationFn: ({ photo, alt }: { photo: File; alt: string }) =>
      uploadGalleryPhoto(organizationId, locationId, photo, { alt }, { headers: { 'Content-Type': photo.type } }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (photoId: string) => deleteGalleryPhoto(organizationId, locationId, photoId),
    onSuccess: refresh,
  });
  const assign = useMutation({
    mutationFn: (data: GalleryAssignmentInput) => saveGalleryAssignment(organizationId, locationId, data),
    onSuccess: refresh,
  });
  const pending = upload.isPending || remove.isPending || assign.isPending;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidation(null);
    remove.reset();
    assign.reset();
    const form = event.currentTarget;
    const values = new FormData(form);
    const photo = values.get('photo');
    const alt = String(values.get('alt') ?? '').trim();
    if (!(photo instanceof File) || !photo.size || photo.size > 3 * 1024 * 1024 ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || !alt) {
      setValidation('Wähle ein JPEG-, PNG- oder WebP-Foto bis 3 MiB und gib eine Bildbeschreibung ein.');
      return;
    }
    upload.mutate({ photo, alt }, { onSuccess: () => form.reset() });
  };
  const error = upload.error ?? remove.error ?? assign.error;
  const photos = gallery.data ?? [];
  const selectPhoto = (data: GalleryAssignmentInput) => {
    setValidation(null);
    upload.reset();
    remove.reset();
    assign.mutate(data);
  };
  return (
    <div className="mt-4 space-y-4">
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>Bis zu 10 Fotos pro Standort. Fotos erscheinen in der öffentlichen Galerie, sobald der Standort veröffentlicht ist.</p>
        <p>JPEG, PNG oder WebP bis 3 MiB. Mindestens 640 × 360, höchstens 3840 × 3840 Pixel. Für Titelbilder empfehlen wir 1280 × 720 Pixel (16:9).</p>
        {gallery.data && <p>{photos.length} von 10 Fotos</p>}
      </div>
      <form onSubmit={submit} className="grid gap-3">
        <Field id="gallery-photo" label="Foto">
          <input id="gallery-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" className={inputCls} required />
        </Field>
        <Field id="gallery-alt" label="Bildbeschreibung">
          <input id="gallery-alt" name="alt" maxLength={160} className={inputCls} required />
        </Field>
        <div><PrimaryButton testId="upload-gallery-photo" pending={upload.isPending} disabled={pending || !gallery.data || photos.length >= 10}>Foto hochladen</PrimaryButton></div>
      </form>
      <FormStatus error={validation ?? (error ? errorText(error) : null)} success={assign.isSuccess ? "Bildzuordnung gespeichert." : null} />
      {gallery.isPending && <p role="status">Fotos werden geladen …</p>}
      {gallery.isError && <button type="button" className="underline" onClick={() => gallery.refetch()}>Fotos erneut laden</button>}
      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {photos.map((photo) => (
          <li key={photo.id}>
            <img src={getGetManagedGalleryImageUrl(organizationId, locationId, photo.id)} alt={photo.alt}
              loading="lazy" className="aspect-[4/3] w-full rounded-xl border border-border object-cover" />
            <button type="button" className="mt-2 text-sm underline" aria-label={`Foto entfernen: ${photo.alt}`}
              disabled={pending} onClick={() => { setValidation(null); upload.reset(); assign.reset(); remove.mutate(photo.id); }}>Entfernen</button>
          </li>
        ))}
      </ul>
      {photos.length > 0 && <section aria-labelledby="gallery-assignments-heading" className="space-y-4 border-t border-border pt-4">
        <h3 id="gallery-assignments-heading" className="font-display text-2xl">Bilder zuordnen</h3>
        {assignments.isPending ? <p role="status">Bildzuordnungen werden geladen …</p>
          : assignments.isError ? <button type="button" className="underline" onClick={() => void assignments.refetch()}>Bildzuordnungen erneut laden</button>
          : <>
            <PhotoSelect label="Titelbild für Profil und Vorschau" photos={photos} value={assignments.data.coverPhotoId}
              disabled={pending} onChange={(photoId) => selectPhoto({ kind: 'cover', photoId })} />
            <details className="space-y-3">
              <summary className="cursor-pointer font-medium">Leistungsbilder</summary>
              {assignments.data.services.length ? assignments.data.services.map((service) =>
                <PhotoSelect key={service.id} label={service.name} photos={photos} value={service.photoId}
                  disabled={pending} onChange={(photoId) => selectPhoto({ kind: 'service', targetId: service.id, photoId })} />)
                : <p className="text-sm text-muted-foreground">Lege zuerst eine Leistung an diesem Standort an.</p>}
            </details>
            <details className="space-y-3">
              <summary className="cursor-pointer font-medium">Produktbilder im Lager</summary>
              {assignments.data.products.length ? assignments.data.products.map((product) =>
                <PhotoSelect key={product.id} label={[product.name, product.sku].filter(Boolean).join(' · ')}
                  photos={photos} value={product.photoId} disabled={pending}
                  onChange={(photoId) => selectPhoto({ kind: 'product', targetId: product.id, photoId })} />)
                : <p className="text-sm text-muted-foreground">Lege zuerst einen Artikel im Lager dieses Standorts an.</p>}
            </details>
          </>}
      </section>}
    </div>
  );
}

function PhotoSelect({ label, photos, value, disabled, onChange }: {
  label: string; photos: GalleryPhoto[]; value: string | null; disabled: boolean;
  onChange: (id: string | null) => void;
}) {
  const id = useId();
  return <Field id={id} label={label} className="max-w-lg">
    <select id={id} className={inputCls} value={value ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value || null)}>
      <option value="">Kein Galeriebild</option>
      {photos.map(({ id, alt }, index) => <option key={id} value={id}>{index + 1}. {alt}</option>)}
    </select>
  </Field>;
}
