import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { MapPin, Search, X } from 'lucide-react';
import type { Business } from '@workspace/api-client-react';
import { useListCategories, getListCategoriesQueryKey } from '@workspace/api-client-react';
import { DemoBadge } from '@/components/site';
import { formatCents, imageFor } from '@/lib/format';

export type Filters = { q: string; city: string; category: string };

export function BusinessCard({ b, index = 0 }: { b: Business; index?: number }) {
  return (
    <Link href={`/salons/${b.slug}`} data-testid={`card-business-${b.slug}`}
      className="group rise block overflow-hidden rounded-[1.4rem] border border-card-border bg-card transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_24px_50px_-24px_hsl(332_45%_26%/.45)]"
      style={{ animationDelay: `${index * 80}ms` }}>
      <div className="relative aspect-[4/3] overflow-hidden">
        <img src={imageFor(b.imageKey)} alt={`Atmosphäre bei ${b.name}`} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
        <DemoBadge className="absolute left-3 top-3 bg-background/90 backdrop-blur" />
      </div>
      <div className="p-5">
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{b.categoryName}</p>
        <h3 className="mt-1 font-display text-2xl" data-testid={`text-business-name-${b.slug}`}>{b.name}</h3>
        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{b.description}</p>
        <div className="mt-4 flex items-end justify-between border-t border-dashed border-border pt-4 text-sm">
          <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-accent" />{b.district}, {b.city}</span>
          <span className="text-right">
            {b.minPriceCents != null ? <><span className="text-muted-foreground">ab </span><span className="font-semibold text-primary">{formatCents(b.minPriceCents)}</span></> : <span className="text-muted-foreground">Preise im Profil</span>}
            <span className="block font-mono text-[10px] text-muted-foreground">{b.serviceCount} Leistungen</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

export function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[1.4rem] border border-card-border bg-card" aria-hidden>
      <div className="aspect-[4/3] animate-pulse bg-muted" />
      <div className="space-y-3 p-5"><div className="h-3 w-20 animate-pulse rounded bg-muted" /><div className="h-6 w-40 animate-pulse rounded bg-muted" /><div className="h-4 w-full animate-pulse rounded bg-muted" /></div>
    </div>
  );
}

export function FilterBar({ value, cities, onChange, compact = false }: { value: Filters; cities: string[]; onChange: (f: Filters) => void; compact?: boolean }) {
  const [q, setQ] = useState(value.q);
  const cats = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });
  const ref = useRef(onChange); ref.current = onChange;
  const valRef = useRef(value); valRef.current = value;
  useEffect(() => { setQ(value.q); }, [value.q]);
  useEffect(() => {
    if (q === valRef.current.q) return;
    const t = setTimeout(() => ref.current({ ...valRef.current, q }), 320);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-4">
      <form role="search" onSubmit={(e) => { e.preventDefault(); onChange({ ...value, q }); }}
        className="flex flex-col gap-2 rounded-[1.4rem] border border-border bg-card p-2 shadow-[0_18px_40px_-30px_hsl(332_45%_26%/.6)] sm:flex-row">
        <label className="flex flex-1 items-center gap-3 rounded-2xl px-4 py-3 focus-within:bg-secondary/60 transition-colors">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="sr-only">Salonname suchen</span>
          <input type="search" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} placeholder="Salonname, z. B. Atelier" className="w-full bg-transparent outline-none placeholder:text-muted-foreground" data-testid="input-search" />
          {q && <button type="button" onClick={() => { setQ(''); onChange({ ...value, q: '' }); }} aria-label="Suche leeren" className="rounded-full p-1 hover:bg-muted" data-testid="button-clear-search"><X className="h-3.5 w-3.5" /></button>}
        </label>
        <label className="flex items-center gap-2 rounded-2xl px-4 py-3 sm:border-l sm:border-border">
          <MapPin className="h-4 w-4 text-accent" aria-hidden />
          <span className="sr-only">Stadt</span>
          <select value={value.city} onChange={(e) => onChange({ ...value, city: e.target.value })} className="bg-transparent outline-none" data-testid="select-city">
            <option value="">Alle Städte</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded-2xl bg-primary px-6 py-3 text-primary-foreground transition-transform active:scale-95" data-testid="button-search">Suchen</button>
      </form>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Kategorie">
        <Chip active={!value.category} onClick={() => onChange({ ...value, category: '' })} testId="chip-category-all">Alle</Chip>
        {cats.isLoading && Array.from({ length: 6 }).map((_, i) => <span key={i} className="h-9 w-24 animate-pulse rounded-full bg-muted" />)}
        {cats.isError && <button onClick={() => cats.refetch()} className="text-sm underline" data-testid="button-retry-categories">Kategorien neu laden</button>}
        {cats.data?.filter((c) => !compact || c.businessCount > 0 || c.slug === value.category).map((c) => (
          <Chip key={c.slug} active={value.category === c.slug} onClick={() => onChange({ ...value, category: value.category === c.slug ? '' : c.slug })} testId={`chip-category-${c.slug}`}>
            {c.name}<span className="ml-1.5 font-mono text-[10px] opacity-60">{c.businessCount}</span>
          </Chip>
        ))}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children, testId }: { active: boolean; onClick: () => void; children: ReactNode; testId: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} data-testid={testId}
      className={`rounded-full border px-4 py-2 text-sm transition-all duration-200 active:scale-95 ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-accent hover:bg-accent/15'}`}>
      {children}
    </button>
  );
}
