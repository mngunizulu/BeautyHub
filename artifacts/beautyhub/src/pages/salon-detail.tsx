import { Link, useParams } from 'wouter';
import { ArrowLeft, CalendarX2, Clock, MapPin } from 'lucide-react';
import { useGetBusiness, getGetBusinessQueryKey } from '@workspace/api-client-react';
import { DemoBadge, ErrorState } from '@/components/site';
import { dayLabel, formatCents, formatDuration, imageFor } from '@/lib/format';

export default function SalonDetail() {
  const { slug = '' } = useParams<{ slug: string }>();
  const q = useGetBusiness(slug, { query: { enabled: !!slug, queryKey: getGetBusinessQueryKey(slug), retry: (n, e) => (e as { status?: number })?.status !== 404 && n < 2 } });
  const b = q.data;
  const notFound = (q.error as { status?: number } | null)?.status === 404;

  return (
    <div className="mx-auto max-w-7xl px-5 pt-8">
      <Link href="/salons" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary" data-testid="link-back"><ArrowLeft className="h-4 w-4" /> Zurück zur Übersicht</Link>
      {q.isLoading ? (
        <div className="mt-6 grid gap-8 md:grid-cols-2" aria-busy="true"><div className="aspect-[4/3] animate-pulse rounded-[1.5rem] bg-muted" /><div className="space-y-4"><div className="h-12 w-2/3 animate-pulse rounded bg-muted" /><div className="h-24 animate-pulse rounded bg-muted" /></div></div>
      ) : notFound ? (
        <div className="mt-10 text-center"><p className="font-display text-4xl">Diesen Salon gibt es nicht.</p><p className="mt-2 text-muted-foreground">Vielleicht wurde der Link falsch kopiert.</p></div>
      ) : q.isError || !b ? <div className="mt-8"><ErrorState onRetry={() => q.refetch()} /></div> : (
        <>
          <section className="mt-6 grid gap-10 md:grid-cols-[1.1fr_1fr] rise">
            <div className="overflow-hidden rounded-[1.5rem] border border-border"><img src={imageFor(b.imageKey)} alt={`Atmosphäre bei ${b.name}`} className="h-full max-h-[520px] w-full object-cover" /></div>
            <div>
              <DemoBadge />
              <p className="mt-5 font-mono text-xs uppercase tracking-wider text-muted-foreground">{b.categoryName}</p>
              <h1 className="mt-1 font-display text-5xl sm:text-6xl" data-testid="text-business-name">{b.name}</h1>
              <p className="mt-4 text-lg text-muted-foreground">{b.description}</p>
              <p className="mt-5 flex items-start gap-2"><MapPin className="mt-1 h-4 w-4 text-accent" /><span data-testid="text-address">{b.address}<br />{b.postalCode} {b.city} · {b.district}</span></p>
              <div className="mt-6 rounded-2xl border border-accent/50 bg-accent/15 p-5" data-testid="text-booking-notice">
                <p className="flex items-center gap-2 font-semibold"><CalendarX2 className="h-4 w-4" /> Online-Buchung noch nicht verfügbar</p>
                <p className="mt-1 text-sm text-muted-foreground">Termine lassen sich erst ab Stufe 4 buchen. Dieser Betrieb ist ein synthetischer Datensatz für die Entwicklung — bitte nicht anrufen oder vorbeigehen.</p>
                <button disabled className="mt-4 cursor-not-allowed rounded-full border border-border bg-card px-5 py-2.5 text-sm opacity-60" data-testid="button-book-disabled">Termin buchen · ab Stufe 4</button>
              </div>
            </div>
          </section>
          <section className="mt-16 grid gap-10 lg:grid-cols-[2fr_1fr]">
            <div>
              <h2 className="font-display text-3xl">Leistungen <span className="font-mono text-sm text-muted-foreground">({b.services.length})</span></h2>
              {b.services.length === 0 ? <p className="mt-4 text-muted-foreground">Noch keine Leistungen hinterlegt.</p> : (
                <ul className="mt-4 divide-y divide-dashed divide-border border-y border-border">
                  {b.services.map((s) => (
                    <li key={s.id} className="group flex items-start justify-between gap-6 py-5 transition-colors hover:bg-secondary/50 sm:px-3" data-testid={`row-service-${s.id}`}>
                      <div><p className="font-semibold">{s.name}</p><p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                        <p className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground"><Clock className="h-3 w-3" />{formatDuration(s.durationMinutes)}</p></div>
                      <p className="whitespace-nowrap font-display text-2xl text-primary transition-transform group-hover:-translate-x-1">{formatCents(s.priceCents)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <aside className="h-fit rounded-[1.5rem] bg-primary p-7 text-primary-foreground lg:sticky lg:top-28">
              <h2 className="font-display text-2xl">Öffnungszeiten</h2>
              <p className="mt-1 font-mono text-[11px] opacity-60">Zeitzone {b.timezone}</p>
              {b.openingHours.length === 0 ? <p className="mt-4 text-sm opacity-80">Keine Angaben.</p> : (
                <dl className="mt-5 space-y-2.5 text-sm">
                  {b.openingHours.map((h, i) => (
                    <div key={i} className="flex justify-between border-b border-primary-foreground/15 pb-2"><dt>{dayLabel(h.day)}</dt><dd className="font-mono">{h.opens}–{h.closes}</dd></div>
                  ))}
                </dl>
              )}
            </aside>
          </section>
        </>
      )}
    </div>
  );
}
