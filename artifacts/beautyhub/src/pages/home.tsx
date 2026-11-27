import { useQuery } from '@tanstack/react-query';
import { getBookingData } from '@/lib/booking';
import { homepageImagesPath, type HomepagePlacement } from '@/lib/homepage-images';
import { Link, useLocation } from 'wouter';
import { ArrowUpRight, Brush, Droplet, Flower2, Hand, Heart, Paintbrush, Scissors, Sparkles, UserRound, type LucideIcon } from 'lucide-react';
import { getListCategoriesQueryKey, useListCategories, useGetMarketplaceSummary, getGetMarketplaceSummaryQueryKey, useListBusinesses, getListBusinessesQueryKey } from '@workspace/api-client-react';
import { BusinessCard, CardSkeleton, FilterBar, type Filters } from '@/components/catalog';
import { ArrowLink, DemoBadge, ErrorState } from '@/components/site';
import { heroImage } from '@/lib/format';

const categoryIcons: Readonly<Record<string, LucideIcon>> = {
  friseur: Scissors,
  barbershop: Brush,
  nagelstudio: Hand,
  kosmetik: UserRound,
  massage: Flower2,
  wellness: Heart,
  'augenbrauen-wimpern': Sparkles,
  koerperbehandlungen: Droplet,
  haarentfernung: Sparkles,
  'tattoo-piercing': Paintbrush,
};

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
  const categories = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });
  const images = useQuery({ queryKey: [homepageImagesPath], queryFn: ({ signal }) => getBookingData<HomepagePlacement[]>(homepageImagesPath, signal) });
  const placements = new Map(images.data?.map((photo) => [photo.target, photo]));
  const hero = placements.get('hero');
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
          <div className="mt-8"><FilterBar value={{ q: '', city: '', category: '' }} cities={s?.cities ?? []} onChange={go} showCategories={false} /></div>
        </div>
        <div className="relative rise" style={{ animationDelay: '150ms' }}>
          <div className="overflow-hidden rounded-t-[12rem] rounded-b-[1.5rem] border border-border">
            <img src={hero ? homepageImagesPath + '/' + hero.id : heroImage} alt={hero?.alt ?? "Salon-Schaufenster in einem Altbau im Abendlicht"} className="h-[260px] w-full object-cover sm:h-[420px] md:h-[560px]" />
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

      <section aria-labelledby="home-categories-heading" className="mx-auto max-w-7xl px-5 pt-6">
        <h2 id="home-categories-heading" className="mb-5 font-display text-4xl sm:text-5xl">Nach Kategorie entdecken</h2>
        {categories.isError ? <ErrorState onRetry={() => categories.refetch()} />
          : categories.isPending ? <p role="status" className="text-muted-foreground">Kategorien werden geladen …</p>
          : <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {categories.data.map(({ slug, name }) => {
              const photo = placements.get('category:' + slug);
              const Icon = categoryIcons[slug] ?? Sparkles;
              return <li key={slug}>
                <Link href={`/salons?category=${encodeURIComponent(slug)}`}
                  className="flex h-full min-h-28 flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-primary transition-colors hover:border-primary hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  {photo && <img src={homepageImagesPath + '/' + photo.id} alt="" loading="lazy" className="aspect-video w-full rounded-lg object-cover" />}
                  {!photo && <span className="flex items-center justify-between"><Icon className="h-6 w-6" aria-hidden /><ArrowUpRight className="h-4 w-4" aria-hidden /></span>}
                  <span className="break-words font-medium text-foreground">{name}</span>
                </Link>
              </li>;
            })}
          </ul>}
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
