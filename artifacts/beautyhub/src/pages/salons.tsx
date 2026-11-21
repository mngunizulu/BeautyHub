import { useMemo } from 'react';
import { useLocation, useSearch } from 'wouter';
import { SearchX } from 'lucide-react';
import { useListBusinesses, getListBusinessesQueryKey, useGetMarketplaceSummary, getGetMarketplaceSummaryQueryKey } from '@workspace/api-client-react';
import { BusinessCard, CardSkeleton, FilterBar, type Filters } from '@/components/catalog';
import { ErrorState } from '@/components/site';

export default function Salons() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const filters = useMemo<Filters>(() => {
    const p = new URLSearchParams(search);
    return { q: p.get('q') ?? '', city: p.get('city') ?? '', category: p.get('category') ?? '' };
  }, [search]);
  const params = useMemo(() => {
    const o: { q?: string; city?: string; category?: string } = {};
    if (filters.q.trim()) o.q = filters.q.trim(); if (filters.city) o.city = filters.city; if (filters.category) o.category = filters.category;
    return o;
  }, [filters]);
  const list = useListBusinesses(params, { query: { queryKey: getListBusinessesQueryKey(params) } });
  const summary = useGetMarketplaceSummary({ query: { queryKey: getGetMarketplaceSummaryQueryKey() } });
  const setFilters = (f: Filters) => {
    const p = new URLSearchParams();
    if (f.q) p.set('q', f.q); if (f.city) p.set('city', f.city); if (f.category) p.set('category', f.category);
    const s = p.toString();
    navigate(`/salons${s ? `?${s}` : ''}`, { replace: true });
  };
  const active = Object.keys(params).length > 0;
  const count = list.data?.length ?? 0;

  return (
    <div className="mx-auto max-w-7xl px-5 pt-10">
      <h1 className="font-display text-5xl sm:text-6xl rise">Salons <span className="italic text-primary">entdecken</span></h1>
      <p className="mt-3 max-w-xl text-muted-foreground">Filter nach Kategorie, Stadt oder Name. Deine Auswahl steht in der Adresszeile und lässt sich teilen.</p>
      <div className="mt-8"><FilterBar value={filters} cities={summary.data?.cities ?? []} onChange={setFilters} /></div>
      <div className="mt-8 flex items-center justify-between border-b border-border pb-3 text-sm" aria-live="polite">
        <span data-testid="text-result-count">{list.isLoading ? 'Suche läuft …' : list.isError ? '' : `${count} ${count === 1 ? 'Betrieb' : 'Betriebe'} gefunden`}</span>
        {active && <button onClick={() => setFilters({ q: '', city: '', category: '' })} className="underline underline-offset-4 hover:text-primary" data-testid="button-reset-filters">Filter zurücksetzen</button>}
      </div>
      <div className="mt-8">
        {list.isError ? <ErrorState onRetry={() => list.refetch()} /> : list.isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>
        ) : count === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-border bg-card px-6 py-16 text-center" data-testid="state-empty">
            <SearchX className="mx-auto h-8 w-8 text-accent" aria-hidden />
            <p className="mt-4 font-display text-3xl">Hier ist noch niemand.</p>
            <p className="mx-auto mt-2 max-w-md text-muted-foreground">Für diese Auswahl gibt es im Entwicklungskatalog keinen Betrieb. Versuch eine andere Kategorie oder entferne Filter.</p>
            <button onClick={() => setFilters({ q: '', city: '', category: '' })} className="mt-6 rounded-full bg-primary px-6 py-3 text-primary-foreground active:scale-95" data-testid="button-empty-reset">Alle Salons zeigen</button>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{list.data!.map((b, i) => <BusinessCard key={b.id} b={b} index={i} />)}</div>
        )}
      </div>
    </div>
  );
}
