import { useAuth } from '@clerk/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { Link } from 'wouter';
import {
  getListMyFavoritesQueryKey, removeFavorite, saveFavorite, useListMyFavorites,
} from '@workspace/api-client-react';
import { FormStatus, Panel } from '@/components/forms';
import { basePath } from '@/lib/auth';
import { errorText } from '@/lib/api';

function useFavorites() {
  const { isLoaded, userId } = useAuth();
  const qc = useQueryClient();
  const queryKey = [...getListMyFavoritesQueryKey(), userId];
  const list = useListMyFavorites({ query: { queryKey, enabled: !!userId } });
  const change = useMutation({
    mutationFn: ({ id, saved }: { id: string; saved: boolean }) => saved ? removeFavorite(id) : saveFavorite(id),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  return { isLoaded, userId, list, change };
}

export function FavoriteButton({ id, slug }: { id: string; slug: string }) {
  const { isLoaded, userId, list, change } = useFavorites();
  const className = "mt-4 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm";
  if (!isLoaded) return null;
  if (!userId) return (
    <Link href={`/sign-in?redirect_url=${encodeURIComponent(`${basePath}/salons/${slug}`)}`} className={className}>
      <Heart className="h-4 w-4" aria-hidden /> Anmelden zum Merken
    </Link>
  );
  if (list.isError) return <button type="button" className={className} onClick={() => list.refetch()}>Favoriten erneut laden</button>;
  const saved = list.data?.some((salon) => salon.id === id) ?? false;
  return (
    <>
      <button type="button" className={className} disabled={list.isPending || change.isPending}
        aria-pressed={saved} onClick={() => change.mutate({ id, saved })}>
        <Heart className={`h-4 w-4 ${saved ? 'fill-current text-primary' : ''}`} aria-hidden />
        {saved ? 'Gemerkt' : 'Salon merken'}
      </button>
      <FormStatus error={change.error ? errorText(change.error) : null} />
    </>
  );
}

export function FavoritesPanel() {
  const { list, change } = useFavorites();
  return (
    <Panel title="Favoriten">
      {list.isPending ? <p role="status">Favoriten werden geladen …</p>
        : list.isError ? <button type="button" className="underline" onClick={() => list.refetch()}>Favoriten erneut laden</button>
        : !list.data?.length ? <p className="text-sm text-muted-foreground">Du hast noch keine Salons gemerkt. <Link href="/salons" className="underline">Salons entdecken</Link></p>
        : <ul className="divide-y divide-border">
          {list.data.map((salon) => (
            <li key={salon.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <Link className="font-medium hover:underline" href={`/salons/${salon.slug}`}>
                {salon.name}<span className="ml-2 text-sm text-muted-foreground">{salon.city}</span>
              </Link>
              <button type="button" className="text-sm underline" aria-label={`${salon.name} aus Favoriten entfernen`}
                disabled={change.isPending} onClick={() => change.mutate({ id: salon.id, saved: true })}>Entfernen</button>
            </li>
          ))}
        </ul>}
      <FormStatus error={change.error ? errorText(change.error) : null} />
    </Panel>
  );
}
