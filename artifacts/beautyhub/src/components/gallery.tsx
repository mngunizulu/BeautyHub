import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  deleteGalleryPhoto, getGetManagedGalleryImageUrl, getGetPublicGalleryImageUrl, getListManagedGalleryQueryKey,
  getListPublicGalleryQueryKey, uploadGalleryPhoto, useListManagedGallery, useListPublicGallery,
  type BusinessWorkspace,
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
  if (!location) return null;
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
  const [validation, setValidation] = useState<string | null>(null);
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: getListManagedGalleryQueryKey(organizationId, locationId) }),
    qc.invalidateQueries({ queryKey: getListPublicGalleryQueryKey(slug) }),
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
  const pending = upload.isPending || remove.isPending;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidation(null);
    remove.reset();
    const form = event.currentTarget;
    const values = new FormData(form);
    const photo = values.get('photo');
    const alt = String(values.get('alt') ?? '').trim();
    if (!(photo instanceof File) || !photo.size || photo.size > 768 * 1024 ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || !alt) {
      setValidation('Wähle ein JPEG-, PNG- oder WebP-Foto bis 768 KB und gib eine Bildbeschreibung ein.');
      return;
    }
    upload.mutate({ photo, alt }, { onSuccess: () => form.reset() });
  };
  const error = upload.error ?? remove.error;
  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-muted-foreground">Bis zu 12 Fotos. Die Galerie ist öffentlich, sobald der Standort veröffentlicht ist.</p>
      <form onSubmit={submit} className="grid gap-3">
        <Field id="gallery-photo" label="Foto">
          <input id="gallery-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" className={inputCls} required />
        </Field>
        <Field id="gallery-alt" label="Bildbeschreibung">
          <input id="gallery-alt" name="alt" maxLength={160} className={inputCls} required />
        </Field>
        <div><PrimaryButton testId="upload-gallery-photo" pending={upload.isPending} disabled={pending || (gallery.data?.length ?? 0) >= 12}>Foto hochladen</PrimaryButton></div>
      </form>
      <FormStatus error={validation ?? (error ? errorText(error) : null)} />
      {gallery.isPending && <p role="status">Fotos werden geladen …</p>}
      {gallery.isError && <button type="button" className="underline" onClick={() => gallery.refetch()}>Fotos erneut laden</button>}
      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {gallery.data?.map((photo) => (
          <li key={photo.id}>
            <img src={getGetManagedGalleryImageUrl(organizationId, locationId, photo.id)} alt={photo.alt}
              loading="lazy" className="aspect-[4/3] w-full rounded-xl border border-border object-cover" />
            <button type="button" className="mt-2 text-sm underline" aria-label={`Foto entfernen: ${photo.alt}`}
              disabled={pending} onClick={() => { upload.reset(); remove.mutate(photo.id); }}>Entfernen</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
