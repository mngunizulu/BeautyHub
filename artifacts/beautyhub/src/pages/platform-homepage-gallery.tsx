import { homepageImagesPath, type HomepagePlacement } from '@/lib/homepage-images';
import { useId, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch, useListCategories } from '@workspace/api-client-react';
import { Field, FormStatus, PrimaryButton, inputCls } from '@/components/forms';
import { errorText } from '@/lib/api';
import { getBookingData, sendBookingData } from '@/lib/booking';

type Photo = { id: string; alt: string };
const adminPath = '/api/admin/homepage-gallery';

export default function PlatformHomepageGallery() {
  const qc = useQueryClient();
  const categories = useListCategories();
  const gallery = useQuery({ queryKey: [adminPath], queryFn: ({ signal }) =>
    getBookingData<{ photos: Photo[]; placements: HomepagePlacement[] }>(adminPath, signal) });
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: [adminPath] }),
    qc.invalidateQueries({ queryKey: [homepageImagesPath] }),
  ]);
  const upload = useMutation({
    mutationFn: ({ alt, photo }: { alt: string; photo: File }) => customFetch(adminPath + '?' + new URLSearchParams({ alt }), {
      method: 'POST', body: photo, headers: { 'Content-Type': photo.type },
    }),
    onSuccess: refresh,
  });
  const assign = useMutation({
    mutationFn: ({ target, photoId }: { target: string; photoId: string | null }) =>
      sendBookingData(adminPath + '/placements/' + encodeURIComponent(target), { photoId }, 'PUT'),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => sendBookingData(adminPath + '/' + id, undefined, 'DELETE'),
    onSuccess: refresh,
  });
  const busy = upload.isPending || assign.isPending || remove.isPending;
  const error = [upload.error, assign.error, remove.error].find(Boolean);
  const reset = () => { upload.reset(); assign.reset(); remove.reset(); };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const photo = data.get('photo');
    if (!(photo instanceof File) || !photo.size) return;
    reset();
    upload.mutate({ photo, alt: String(data.get('alt') ?? '') }, { onSuccess: () => form.reset() });
  };
  return <div className="mx-auto max-w-5xl space-y-5 px-5 py-10">
    <h1 className="font-display text-4xl">Startseitengalerie</h1>
    <p className="text-sm text-muted-foreground">JPEG, PNG oder WebP bis 3 MiB und 640 × 360 bis 3840 × 3840 Pixel. Fotos werden erst nach der Zuordnung öffentlich.</p>
    {gallery.isPending ? <p role="status">Galerie wird geladen …</p> : gallery.isError ?
      <button type="button" className="underline" onClick={() => void gallery.refetch()}>Galerie erneut laden</button> : <>
      <form onSubmit={submit} className="grid gap-3">
        <Field id="home-gallery-photo" label="Foto">
          <input id="home-gallery-photo" name="photo" type="file" required accept="image/jpeg,image/png,image/webp" className={inputCls} />
        </Field>
        <Field id="home-gallery-alt" label="Bildbeschreibung">
          <input id="home-gallery-alt" name="alt" maxLength={160} required className={inputCls} />
        </Field>
        <div><PrimaryButton testId="upload-homepage-photo" pending={upload.isPending} disabled={busy || gallery.data.photos.length >= 24}>Foto hochladen</PrimaryButton></div>
      </form>
      <FormStatus error={error ? errorText(error) : null} success={assign.isSuccess ? 'Bildzuordnung gespeichert.' : null} />
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {gallery.data.photos.map(({ id, alt }, index) => <li key={id}>
          <img src={adminPath + '/' + id} alt={alt} loading="lazy" className="aspect-video w-full rounded-lg object-cover" />
          <p className="mt-1 break-words text-sm">{index + 1}. {alt}</p>
          <button type="button" className="text-sm underline" aria-label={`Foto entfernen: ${alt}`} disabled={busy}
            onClick={() => { reset(); remove.mutate(id); }}>Entfernen</button>
        </li>)}
      </ul>
      <div className="grid gap-3 sm:grid-cols-2">
        {[{ target: 'hero', label: 'Hauptbild der Startseite' },
          ...(categories.data ?? []).map(({ slug, name }) => ({ target: 'category:' + slug, label: name }))].map(({ target, label }) =>
          <PlacementSelect key={target} label={label} photos={gallery.data.photos}
            current={gallery.data.placements.find((entry) => entry.target === target)?.id ?? ''}
            disabled={busy} onChange={(photoId) => { reset(); assign.mutate({ target, photoId: photoId || null }); }} />)}
      </div>
      {categories.isError && <button type="button" className="underline" onClick={() => void categories.refetch()}>Kategorien erneut laden</button>}
    </>}
  </div>;
}

function PlacementSelect({ label, photos, current, disabled, onChange }: {
  label: string; photos: Photo[]; current: string; disabled: boolean; onChange: (id: string) => void;
}) {
  const id = useId();
  return <Field label={label} id={id}>
    <select id={id} value={current} disabled={disabled} className={inputCls} onChange={(event) => onChange(event.target.value)}>
      <option value="">Standarddarstellung</option>
      {photos.map(({ id, alt }, index) => <option key={id} value={id}>{index + 1}. {alt}</option>)}
    </select>
  </Field>;
}
