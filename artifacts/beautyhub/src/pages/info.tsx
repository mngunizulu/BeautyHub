import { Link } from 'wouter';
import { useAuth } from '@clerk/react';
import { CheckCircle2, CircleDashed, Loader2 } from 'lucide-react';
import { useGetSystemStatus, getGetSystemStatusQueryKey, useHealthCheck, getHealthCheckQueryKey } from '@workspace/api-client-react';
import { ArrowLink, ErrorState } from '@/components/site';
import { formatDateTime } from '@/lib/format';

export function ForBusiness() {
  const sys = useGetSystemStatus({ query: { queryKey: getGetSystemStatusQueryKey() } });
  const { isSignedIn } = useAuth();
  return (
    <div className="mx-auto max-w-7xl px-5 pt-12">
      <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground rise">Für Salons, Studios & Praxen</p>
      <h1 className="mt-3 max-w-4xl font-display text-5xl leading-[1] sm:text-7xl rise">Dein Handwerk verdient eine <span className="italic text-primary">ruhige Bühne.</span></h1>
      <p className="mt-6 max-w-2xl text-lg text-muted-foreground">Lege deinen Betrieb an, richte ihn in sechs Schritten ein und veröffentliche ihn, sobald alles stimmt. Du kannst jederzeit unterbrechen und später weitermachen. Ein Konto kann mehrere Betriebe führen.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <ArrowLink href={isSignedIn ? '/unternehmen?neu=1' : '/sign-up'} testId="link-create-business">{isSignedIn ? 'Betrieb anlegen' : 'Konto erstellen und Betrieb anlegen'}</ArrowLink>
        <Link href="/system" className="rounded-full border border-border px-6 py-3 hover:bg-secondary" data-testid="link-roadmap">Zum Fahrplan</Link>
      </div>
      <div className="mt-16 grid gap-6 md:grid-cols-[1.3fr_1fr]">
        <div className="rounded-[1.5rem] border border-border bg-card p-8">
          <h2 className="font-display text-3xl">Was du heute einrichten kannst</h2>
          <ul className="mt-5 space-y-3">{['Profil, Kategorie und Kontaktdaten', 'Standorte mit deutscher Adresse in jeder Stadt', 'Öffnungszeiten, Vorlaufzeiten und Stornoregeln', 'Team, Einladungen und Rollen', 'Leistungen mit Varianten, Preisen und Puffern'].map((t) => <li key={t} className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />{t}</li>)}</ul>
        </div>
        <div className="rounded-[1.5rem] bg-secondary p-8 demo-stripe">
          <h2 className="font-display text-3xl">Noch nicht möglich</h2>
          <p className="mt-3 text-muted-foreground">Online-Buchungen, Kalender und Zahlungen folgen in späteren Stufen. Wir zeigen nichts an, was nicht funktioniert.</p>
          {sys.data && <p className="mt-4 font-mono text-xs">Buchungen: {sys.data.bookingEnabled ? 'aktiv' : 'deaktiviert'} · Konten: {sys.data.authenticationEnabled ? 'aktiv' : 'deaktiviert'}</p>}
        </div>
      </div>
    </div>
  );
}

export function SystemPage() {
  const h = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 30000 } });
  const sys = useGetSystemStatus({ query: { queryKey: getGetSystemStatusQueryKey() } });
  const ok = h.data?.status === 'ok';
  return (
    <div className="mx-auto max-w-7xl px-5 pt-12">
      <h1 className="font-display text-5xl sm:text-6xl rise">System & <span className="italic text-primary">Fahrplan</span></h1>
      <p className="mt-3 max-w-xl text-muted-foreground">Was heute läuft, was bewusst noch aus ist und was als Nächstes kommt.</p>
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="rounded-[1.5rem] border border-border bg-card p-7" data-testid="card-health">
          <div className="flex items-center justify-between"><h2 className="font-display text-2xl">Gesundheit</h2>
            <button onClick={() => h.refetch()} className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-secondary" data-testid="button-refresh-health">{h.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Aktualisieren'}</button></div>
          {h.isLoading ? <div className="mt-4 h-20 animate-pulse rounded bg-muted" /> : h.isError ? <div className="mt-4"><ErrorState title="Server nicht erreichbar" onRetry={() => h.refetch()} /></div> : h.data && (
            <div className="mt-5 space-y-2 text-sm">
              <p className="flex items-center gap-2" data-testid="status-health"><span className={`h-2.5 w-2.5 rounded-full ${ok ? 'bg-chart-3' : 'bg-accent'} ${ok ? 'animate-pulse' : ''}`} />{ok ? 'Alles in Ordnung' : 'Eingeschränkt'}</p>
              <p>Datenbank: {h.data.database === 'connected' ? 'verbunden' : 'nicht verfügbar'}</p>
              <p className="font-mono text-xs text-muted-foreground">Version {h.data.version} · Stand {formatDateTime(h.data.timestamp)}</p>
            </div>
          )}
        </div>
        <div className="rounded-[1.5rem] bg-primary p-7 text-primary-foreground" data-testid="card-system">
          <h2 className="font-display text-2xl">Grundlagen</h2>
          {sys.isLoading ? <div className="mt-4 h-20 animate-pulse rounded bg-primary-foreground/10" /> : sys.isError ? <button onClick={() => sys.refetch()} className="mt-4 underline" data-testid="button-retry-system">Erneut laden</button> : sys.data && (
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {[['Name', sys.data.name], ['Version', sys.data.version], ['Sprache', sys.data.locale], ['Währung', sys.data.currency], ['Zeitzone', sys.data.timezone], ['Modus', sys.data.developmentMode ? 'Entwicklung' : 'Produktion'], ['Buchungen', sys.data.bookingEnabled ? 'aktiv' : 'aus'], ['Konten', sys.data.authenticationEnabled ? 'aktiv' : 'aus']].map(([k, v]) => (
                <div key={k}><dt className="font-mono text-[10px] uppercase opacity-60">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          )}
        </div>
      </div>
      <h2 className="mt-16 font-display text-4xl">Zehn Stufen</h2>
      <ol className="mt-6 grid gap-3 md:grid-cols-2">
        {sys.isLoading && Array.from({ length: 4 }).map((_, i) => <li key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />)}
        {sys.data?.stages.map((st) => {
          const cur = st.status === 'in_progress';
          return (
            <li key={st.number} className={`flex gap-4 rounded-2xl border p-5 transition-transform hover:-translate-y-0.5 ${cur ? 'border-accent bg-accent/15' : 'border-border bg-card'}`} data-testid={`row-stage-${st.number}`}>
              <span className="font-display text-4xl text-primary/80 w-10">{st.number}</span>
              <div><p className="flex items-center gap-2 font-semibold">{st.title}{cur ? <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-[10px] text-primary-foreground">in Arbeit</span> : <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" aria-label="geplant" />}</p>
                <p className="mt-1 text-sm text-muted-foreground">{st.description}</p></div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
