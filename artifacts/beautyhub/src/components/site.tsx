import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { AlertTriangle, ArrowUpRight, FlaskConical, Menu, RotateCw, X } from 'lucide-react';
import { useGetSession, getGetSessionQueryKey } from '@workspace/api-client-react';

const nav = [
  { href: '/salons', label: 'Salons entdecken' },
  { href: '/fuer-unternehmen', label: 'Für Unternehmen' },
  { href: '/system', label: 'Fahrplan' },
];

export function Logo() {
  return (
    <Link href="/" className="flex items-baseline gap-1.5 group" data-testid="link-home">
      <span className="font-display text-2xl font-semibold text-primary">Beauty</span>
      <span className="font-display text-2xl italic text-foreground/80 transition-transform duration-300 group-hover:-translate-y-0.5">hub</span>
      <span className="ml-1 h-2 w-2 rounded-full bg-accent" aria-hidden />
    </Link>
  );
}

export function DemoBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-accent/60 bg-accent/20 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-foreground ${className}`} data-testid="badge-demo">
      <FlaskConical className="h-3 w-3" aria-hidden /> Synthetische Demo-Daten
    </span>
  );
}

function SessionChip() {
  const { data } = useGetSession({ query: { queryKey: getGetSessionQueryKey() } });
  return (
    <Link href="/anmelden" className="rounded-full border border-border px-4 py-2 text-sm transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground" data-testid="link-anmelden">
      Anmelden{data && !data.configured ? <span className="ml-2 font-mono text-[10px] opacity-60">ab Stufe 2</span> : null}
    </Link>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <a href="#inhalt" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">Zum Inhalt springen</a>
      <div className="demo-stripe border-b border-accent/40 bg-secondary text-center font-mono text-[11px] py-1.5 px-4" data-testid="text-stage-banner">
        Stufe 1 · Entwicklungskatalog mit synthetischen Betrieben · Buchungen ab Stufe 4
      </div>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <Logo />
          <nav className="hidden items-center gap-7 md:flex" aria-label="Hauptnavigation">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} data-testid={`link-nav-${n.href.slice(1)}`}
                className={`relative text-sm after:absolute after:-bottom-1 after:left-0 after:h-px after:w-full after:origin-left after:bg-accent after:transition-transform after:duration-300 ${loc.startsWith(n.href) ? 'text-primary after:scale-x-100' : 'text-foreground/75 hover:text-foreground after:scale-x-0 hover:after:scale-x-100'}`}>
                {n.label}
              </Link>
            ))}
            <SessionChip />
          </nav>
          <button className="md:hidden rounded-full p-2 hover:bg-secondary" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? 'Menü schließen' : 'Menü öffnen'} data-testid="button-menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {open && (
          <nav className="border-t border-border px-5 py-4 md:hidden rise" aria-label="Mobile Navigation">
            {[...nav, { href: '/anmelden', label: 'Anmelden' }].map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="block py-3 font-display text-2xl" data-testid={`link-mobile-${n.href.slice(1)}`}>{n.label}</Link>
            ))}
          </nav>
        )}
      </header>
      <main id="inhalt" className="flex-1">{children}</main>
      <footer className="mt-24 bg-primary text-primary-foreground">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-[2fr_1fr_1fr]">
          <div>
            <p className="font-display text-4xl leading-tight">Gute Hände finden.<br /><span className="italic text-accent">Ohne Umwege.</span></p>
            <p className="mt-4 max-w-md text-sm opacity-70">BeautyHub befindet sich in Stufe 1. Alle angezeigten Betriebe sind synthetische Entwicklungsdaten und keine echten Unternehmen.</p>
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-mono text-[11px] uppercase tracking-wider opacity-60">Entdecken</p>
            <Link href="/salons" className="block hover:text-accent">Alle Salons</Link>
            <Link href="/salons?city=Berlin" className="block hover:text-accent">Berlin</Link>
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-mono text-[11px] uppercase tracking-wider opacity-60">Plattform</p>
            <Link href="/fuer-unternehmen" className="block hover:text-accent">Für Unternehmen</Link>
            <Link href="/system" className="block hover:text-accent">System & Fahrplan</Link>
            <Link href="/anmelden" className="block hover:text-accent">Konto</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function ErrorState({ title = 'Das hat nicht geklappt.', onRetry }: { title?: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center" data-testid="state-error">
      <AlertTriangle className="mx-auto h-6 w-6 text-destructive" aria-hidden />
      <p className="mt-3 font-display text-2xl">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">Die Daten konnten gerade nicht geladen werden.</p>
      <button onClick={onRetry} className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm text-primary-foreground transition-transform active:scale-95" data-testid="button-retry">
        <RotateCw className="h-4 w-4" /> Erneut versuchen
      </button>
    </div>
  );
}

export function ArrowLink({ href, children, testId }: { href: string; children: ReactNode; testId: string }) {
  return (
    <Link href={href} data-testid={testId} className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-primary-foreground transition-all hover:bg-primary/90 active:scale-[.97]">
      {children}
      <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </Link>
  );
}
