import { useLocation } from 'wouter';
import { useGetMarketplaceSummary, getGetMarketplaceSummaryQueryKey, useListBusinesses, getListBusinessesQueryKey } from '@workspace/api-client-react';
import { BusinessCard, CardSkeleton, FilterBar, type Filters } from '@/components/catalog';
import { ArrowLink, DemoBadge, ErrorState } from '@/components/site';
import { heroImage } from '@/lib/format';

export default function Home() {
  const [, navigate] = useLocation();
  const summary = useGetMarketplaceSummary({ query: { queryKey: getGetMarketplaceSummaryQueryKey() } });
  const list = useListBusinesses(undefined, { query: { queryKey: getListBusinessesQueryKey() } });
  const go = (f: Filters) => {
    const p = new URLSearchParams();
    if (f.q) p.set('q', f.q); if (f.city) p.set('city', f.city); if (f.category) p.set('category', f.category);
    const s = p.toString();
    navigate(`/salons${s ? `?${s}` : ''}`);
  };
  const s = summary.data;
  return (
    <>
      <section className="relative mx-auto grid max-w-7xl gap-10 px-5 pt-10 pb-16 md:grid-cols-[1.15fr_1fr] md:pt-16">
        <div className="rise">
          {s?.isDemo && <DemoBadge />}
          <h1 className="mt-6 font-display text-5xl leading-[0.95] sm:text-7xl lg:text-[5.5rem]">
            Dein nächster<br />Salon wohnt<br /><span className="italic text-primary">um die Ecke.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg text-muted-foreground">Friseur, Nägel, Ruhe für den Kopf. BeautyHub zeigt dir lokale Betriebe mit klaren Preisen und Öffnungszeiten — ohne Werbelärm.</p>
          <div className="mt-8"><FilterBar value={{ q: '', city: '', category: '' }} cities={s?.cities ?? []} onChange={go} compact /></div>
        </div>
        <div className="relative rise" style={{ animationDelay: '150ms' }}>
          <div className="overflow-hidden rounded-t-[12rem] rounded-b-[1.5rem] border border-border">
            <img src={heroImage} alt="Salon-Schaufenster in einem Altbau im Abendlicht" className="h-[420px] w-full object-cover md:h-[560px]" />
          </div>
          <div className="absolute -bottom-6 -left-4 rounded-2xl border border-border bg-card p-5 shadow-xl sm:-left-8" data-testid="card-summary">
            {summary.isLoading ? <div className="h-16 w-48 animate-pulse rounded bg-muted" /> : summary.isError ? (
              <button className="text-sm underline" onClick={() => summary.refetch()} data-testid="button-retry-summary">Übersicht neu laden</button>
            ) : s && (
              <dl className="grid grid-cols-3 gap-5 text-center">
                {[[s.businessCount, 'Betriebe'], [s.serviceCount, 'Leistungen'], [s.categoryCount, 'Kategorien']].map(([n, l]) => (
                  <div key={l as string}><dt className="sr-only">{l}</dt><dd className="font-display text-3xl text-primary">{n}</dd><p className="font-mono text-[10px] uppercase text-muted-foreground">{l}</p></div>
                ))}
              </dl>
            )}
            {s?.isDemo && <p className="mt-3 max-w-[16rem] text-[11px] text-muted-foreground">Enthält gekennzeichnete synthetische Demo-Betriebe.</p>}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pt-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-accent-foreground/70">Im Katalog{s?.cities.length ? ` · ${s.cities.join(', ')}` : ''}</p>
            <h2 className="mt-2 font-display text-4xl sm:text-5xl">Adressen zum Kennenlernen</h2>
          </div>
          <ArrowLink href="/salons" testId="link-all-salons">Alle Salons ansehen</ArrowLink>
        </div>
        {list.isError ? <ErrorState onRetry={() => list.refetch()} /> : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {list.isLoading ? Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />) : list.data?.slice(0, 6).map((b, i) => <BusinessCard key={b.id} b={b} index={i} />)}
          </div>
        )}
      </section>

      <section className="mx-auto mt-24 grid max-w-7xl gap-px overflow-hidden rounded-[1.5rem] border border-border bg-border px-0 md:grid-cols-[1fr_1fr_1fr] mx-5 xl:mx-auto">
        {[
          ['01', 'Preise vorab', 'Jede Leistung mit Dauer und Euro-Betrag. Kein Rätselraten an der Kasse.'],
          ['02', 'Echte Öffnungszeiten', 'Direkt aus dem Profil des Betriebs, Wochentag für Wochentag.'],
          ['03', 'Buchen kommt später', 'Termine werden erst in Stufe 4 freigeschaltet. Bis dahin: ehrlich stöbern.'],
        ].map(([n, t, d]) => (
          <div key={n} className="bg-card p-8 transition-colors hover:bg-secondary">
            <p className="font-mono text-xs text-accent">{n}</p>
            <h3 className="mt-3 font-display text-2xl">{t}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{d}</p>
          </div>
        ))}
      </section>
    </>
  );
}
