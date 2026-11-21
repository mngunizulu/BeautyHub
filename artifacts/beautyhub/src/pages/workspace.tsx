import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams, useSearch } from 'wouter';
import { ArrowLeft, CalendarClock, Check, Circle, Clock, FileText, LayoutGrid, MapPin, Scissors, Settings2, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { useGetOrganizationWorkspace, getGetOrganizationWorkspaceQueryKey, useSaveOrganizationProfile, type BusinessWorkspace } from '@workspace/api-client-react';
import { FormStatus, Panel, PrimaryButton } from '@/components/forms';
import { ErrorState, DemoBadge } from '@/components/site';
import {
  LocationEditor, LocationPartSection, LocationsSection, OrganizationSettingsSection, PolicySection, ProfileSection, PublicationPanel,
  ServicesSection, StaffSection, InvitePanel, profileDto, type Perms,
} from '@/components/workspace-sections';
import { AuthSkeleton } from '@/lib/auth';
import { errorText, roleLabel, statusOf, useWorkspaceSync } from '@/lib/api';
import { formatCents } from '@/lib/format';

const SECTIONS = [
  { key: 'einrichtung', label: 'Einrichtung', icon: Sparkles, edit: true },
  { key: 'uebersicht', label: 'Übersicht', icon: LayoutGrid },
  { key: 'profil', label: 'Profil', icon: FileText },
  { key: 'standorte', label: 'Standorte', icon: MapPin },
  { key: 'team', label: 'Mitarbeitende', icon: Users },
  { key: 'leistungen', label: 'Leistungen', icon: Scissors },
  { key: 'zeiten', label: 'Öffnungszeiten', icon: Clock },
  { key: 'buchung', label: 'Buchungseinstellungen', icon: CalendarClock },
  { key: 'storno', label: 'Stornierung', icon: ShieldCheck },
  { key: 'organisation', label: 'Organisation', icon: Settings2 },
] as const;
type SectionKey = (typeof SECTIONS)[number]['key'];

const STEPS = ['Identität', 'Adresse', 'Betrieb', 'Team', 'Leistungen', 'Prüfung'];

export default function WorkspacePage() {
  const { organizationId = '' } = useParams<{ organizationId: string }>();
  const search = useSearch();
  const [, navigate] = useLocation();
  const q = useGetOrganizationWorkspace(organizationId, { query: { enabled: !!organizationId, queryKey: getGetOrganizationWorkspaceQueryKey(organizationId) } });
  const ws = q.data;

  if (q.isLoading) return <AuthSkeleton />;
  if (q.isError || !ws) {
    const s = statusOf(q.error);
    return (
      <div className="mx-auto max-w-3xl px-5 pt-12">
        <Link href="/unternehmen" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary" data-testid="link-back-organizations"><ArrowLeft className="h-4 w-4" />Meine Betriebe</Link>
        {s === 403 || s === 404 ? (
          <div className="mt-8 rounded-[1.4rem] border border-dashed border-border bg-card p-10 text-center" data-testid="state-no-access">
            <p className="font-display text-3xl">Kein Zugriff auf diesen Betrieb.</p>
            <p className="mt-2 text-muted-foreground">{errorText(q.error)}</p>
          </div>
        ) : <div className="mt-8"><ErrorState title="Betrieb konnte nicht geladen werden." onRetry={() => q.refetch()} /></div>}
      </div>
    );
  }

  const perms: Perms = { canEdit: ws.role === 'owner' || ws.role === 'manager', isOwner: ws.role === 'owner' };
  const anyPublished = ws.locations.some((l) => l.published);
  const requested = new URLSearchParams(search).get('bereich') as SectionKey | null;
  const valid = SECTIONS.filter((s) => !('edit' in s) || perms.canEdit).map((s) => s.key) as SectionKey[];
  const section: SectionKey = requested && valid.includes(requested) ? requested : perms.canEdit && !anyPublished ? 'einrichtung' : 'uebersicht';
  const go = (k: SectionKey) => navigate(`/unternehmen/${ws.id}?bereich=${k}`, { replace: true });

  return (
    <div className="mx-auto max-w-7xl px-5 pt-8">
      <Link href="/unternehmen" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary" data-testid="link-back-organizations"><ArrowLeft className="h-4 w-4" />Meine Betriebe</Link>
      <header className="mt-4 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{roleLabel[ws.role] ?? ws.role} · {anyPublished ? 'veröffentlicht' : 'Entwurf'}</p>
          <h1 className="mt-1 font-display text-4xl sm:text-5xl" data-testid="text-workspace-name">{ws.name}</h1>
        </div>
        {ws.isDemo && <DemoBadge />}
      </header>
      <div className="mt-6 grid gap-8 lg:grid-cols-[230px_1fr]">
        <nav aria-label="Betriebsbereiche" className="lg:sticky lg:top-24 lg:h-fit">
          <ul className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {SECTIONS.filter((s) => valid.includes(s.key)).map((s) => {
              const Icon = s.icon; const on = section === s.key;
              return (
                <li key={s.key} className="shrink-0">
                  <button type="button" onClick={() => go(s.key)} aria-current={on ? 'page' : undefined} data-testid={`nav-section-${s.key}`}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors ${on ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}>
                    <Icon className="h-4 w-4" />{s.label}
                    {s.key === 'einrichtung' && <span className="ml-auto font-mono text-[10px] opacity-70">{ws.profile.onboardingStep}/6</span>}
                  </button>
                </li>
              );
            })}
            <li className="shrink-0 lg:mt-3">
              <span className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted-foreground" title="Kalender und Termine folgen in Stufe 4" data-testid="nav-calendar-disabled"><CalendarClock className="h-4 w-4" />Kalender<span className="ml-auto font-mono text-[10px]">Stufe 4</span></span>
            </li>
          </ul>
        </nav>
        <div key={section} className="min-w-0 rise">
          {section === 'einrichtung' && <Onboarding ws={ws} perms={perms} onFinish={() => go('uebersicht')} />}
          {section === 'uebersicht' && <Overview ws={ws} perms={perms} go={go} />}
          {section === 'profil' && <ProfileSection ws={ws} perms={perms} />}
          {section === 'standorte' && <div className="space-y-6"><LocationsSection ws={ws} perms={perms} /><PublicationPanel ws={ws} perms={perms} /></div>}
          {section === 'team' && <StaffSection ws={ws} perms={perms} />}
          {section === 'leistungen' && <ServicesSection ws={ws} perms={perms} />}
          {section === 'zeiten' && <LocationPartSection ws={ws} perms={perms} part="hours" title="Öffnungszeiten" kicker="Pro Standort" />}
          {section === 'buchung' && <LocationPartSection ws={ws} perms={perms} part="booking" title="Buchungseinstellungen" kicker="Vorbereitung für Stufe 4" />}
          {section === 'storno' && <PolicySection ws={ws} perms={perms} />}
          {section === 'organisation' && <OrganizationSettingsSection ws={ws} perms={perms} />}
        </div>
      </div>
    </div>
  );
}

function Overview({ ws, perms, go }: { ws: BusinessWorkspace; perms: Perms; go: (k: SectionKey) => void }) {
  const active = ws.services.filter((s) => !s.archived);
  const prices = active.map((s) => s.priceCents);
  const facts: [string, string, SectionKey][] = [
    [String(ws.locations.length), ws.locations.length === 1 ? 'Standort' : 'Standorte', 'standorte'],
    [String(ws.employees.filter((e) => e.active).length), 'aktive Mitarbeitende', 'team'],
    [String(active.length), 'aktive Leistungen', 'leistungen'],
    [String(ws.memberships.filter((m) => m.status === 'active').length), 'aktive Mitglieder', 'organisation'],
  ];
  const policy = [...ws.policies].sort((a, b) => b.version - a.version)[0];
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {facts.map(([n, l, k]) => (
          <button key={l} type="button" onClick={() => go(k)} className="rounded-[1.2rem] border border-card-border bg-card p-5 text-left transition-transform hover:-translate-y-0.5" data-testid={`card-fact-${k}`}>
            <p className="font-display text-4xl text-primary">{n}</p><p className="mt-1 font-mono text-[11px] uppercase text-muted-foreground">{l}</p>
          </button>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Panel title="Profil" kicker="Öffentlicher Auftritt">
          <p className="text-muted-foreground">{ws.profile.description || 'Noch keine Beschreibung hinterlegt.'}</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="font-mono text-[10px] uppercase text-muted-foreground">Kontakt</dt><dd>{ws.profile.contactEmail || '—'}{ws.profile.phone ? ` · ${ws.profile.phone}` : ''}</dd></div>
            <div><dt className="font-mono text-[10px] uppercase text-muted-foreground">Preisspanne</dt><dd>{prices.length ? `${formatCents(Math.min(...prices))} – ${formatCents(Math.max(...prices))}` : '—'}</dd></div>
            <div><dt className="font-mono text-[10px] uppercase text-muted-foreground">Stornierung</dt><dd>{policy ? `${policy.noticeHours} Std. kostenfrei · Version ${policy.version}` : 'Standard (24 Std.)'}</dd></div>
            <div><dt className="font-mono text-[10px] uppercase text-muted-foreground">Städte</dt><dd>{[...new Set(ws.locations.map((l) => l.city).filter(Boolean))].join(', ') || '—'}</dd></div>
          </dl>
          {perms.canEdit && <button type="button" onClick={() => go('profil')} className="mt-4 text-sm text-primary underline" data-testid="button-edit-profile">Profil bearbeiten</button>}
        </Panel>
        <PublicationPanel ws={ws} perms={perms} />
      </div>
      {!perms.canEdit && <p className="rounded-xl border border-dashed border-border bg-secondary/50 p-4 text-sm text-muted-foreground">Du siehst diesen Betrieb als Mitarbeiter:in. Änderungen nehmen Inhaber:innen oder Leitungen vor.</p>}
    </div>
  );
}

function Onboarding({ ws, perms, onFinish }: { ws: BusinessWorkspace; perms: Perms; onFinish: () => void }) {
  const sync = useWorkspaceSync(ws.id);
  const save = useSaveOrganizationProfile();
  const [step, setStep] = useState(() => Math.min(6, Math.max(1, ws.profile.onboardingStep)));
  const [err, setErr] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } headingRef.current?.focus(); }, [step]);
  const loc = ws.locations[0];

  /** Persist resume point and advance. */
  const advance = (to: number, after?: () => void) => {
    setErr(null);
    const target = Math.max(to, ws.profile.onboardingStep);
    if (target === ws.profile.onboardingStep) { setStep(to); after?.(); return; }
    save.mutate({ organizationId: ws.id, data: profileDto(ws.profile, target) }, {
      onSuccess: (w) => { sync(w, false); setStep(to); after?.(); },
      onError: (e) => setErr(errorText(e)),
    });
  };

  return (
    <div className="space-y-6">
      <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Fortschritt der Einrichtung">
        {STEPS.map((label, i) => {
          const n = i + 1; const done = n < ws.profile.onboardingStep || (n < step); const cur = n === step;
          const reachable = n <= Math.max(ws.profile.onboardingStep, step);
          return (
            <li key={label}>
              <button type="button" disabled={!reachable} onClick={() => setStep(n)} aria-current={cur ? 'step' : undefined} data-testid={`button-step-${n}`}
                className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-colors disabled:opacity-50 ${cur ? 'border-primary bg-primary text-primary-foreground' : done ? 'border-border bg-secondary' : 'border-dashed border-border'}`}>
                {done && !cur ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}<span><span className="font-mono">{n}</span> {label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div>
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Schritt {step} von 6</p>
        <h2 ref={headingRef} tabIndex={-1} className="font-display text-3xl outline-none sm:text-4xl" data-testid="text-step-heading">{['Wer seid ihr?', 'Wo findet man euch?', 'Wie arbeitet ihr?', 'Wer gehört zum Team?', 'Was bietet ihr an?', 'Alles prüfen und veröffentlichen'][step - 1]}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Dein Fortschritt wird gespeichert. Du kannst jederzeit unterbrechen und hier weitermachen.</p>
      </div>

      {step === 1 && <ProfileSection ws={ws} perms={perms} nextStep={2} submitLabel="Speichern und weiter" onSaved={() => setStep(2)} />}
      {step === 2 && (
        <Panel title={loc ? loc.name : 'Erster Standort'} kicker="Adresse">
          <LocationEditor key={loc?.id ?? 'new'} ws={ws} perms={perms} location={loc} part="address" submitLabel={loc ? 'Adresse speichern' : 'Standort anlegen'} />
          {ws.locations.length > 1 && <p className="mt-4 text-sm text-muted-foreground">Weitere Standorte verwaltest du im Bereich „Standorte“.</p>}
        </Panel>
      )}
      {step === 3 && (loc ? (
        <>
          <Panel title="Öffnungszeiten" kicker={loc.name}><LocationEditor key={`${loc.id}-h`} ws={ws} perms={perms} location={loc} part="hours" submitLabel="Öffnungszeiten speichern" /></Panel>
          <Panel title="Kontakt & Terminvorlauf" kicker={loc.name}><LocationEditor key={`${loc.id}-b`} ws={ws} perms={perms} location={loc} part="booking" submitLabel="Einstellungen speichern" /></Panel>
          <PolicySection ws={ws} perms={perms} />
        </>
      ) : <Panel title="Zuerst die Adresse" kicker="Fehlt"><p className="text-sm text-muted-foreground">Lege in Schritt 2 einen Standort an.</p><div className="mt-3"><PrimaryButton type="button" variant="ghost" onClick={() => setStep(2)} testId="button-goto-step-2">Zu Schritt 2</PrimaryButton></div></Panel>)}
      {step === 4 && <><StaffSection ws={ws} perms={perms} /><InvitePanel ws={ws} perms={perms} /></>}
      {step === 5 && <ServicesSection ws={ws} perms={perms} />}
      {step === 6 && (
        <>
          <Panel title="Zusammenfassung" kicker="Prüfung">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="font-mono text-[10px] uppercase text-muted-foreground">Name</dt><dd className="font-semibold">{ws.profile.name}</dd></div>
              <div><dt className="font-mono text-[10px] uppercase text-muted-foreground">Kontakt</dt><dd>{ws.profile.contactEmail || '—'} {ws.profile.phone}</dd></div>
              <div><dt className="font-mono text-[10px] uppercase text-muted-foreground">Standorte</dt><dd>{ws.locations.map((l) => `${l.name} (${[l.postalCode, l.city].filter(Boolean).join(' ') || 'ohne Ort'})`).join(', ') || '—'}</dd></div>
              <div><dt className="font-mono text-[10px] uppercase text-muted-foreground">Team</dt><dd>{ws.employees.map((e) => e.displayName).join(', ') || '—'}</dd></div>
              <div className="sm:col-span-2"><dt className="font-mono text-[10px] uppercase text-muted-foreground">Leistungen</dt><dd>{ws.services.filter((s) => !s.archived).map((s) => `${s.name} ${formatCents(s.priceCents)}`).join(' · ') || '—'}</dd></div>
            </dl>
          </Panel>
          <PublicationPanel ws={ws} perms={perms} />
        </>
      )}

      <FormStatus error={err} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <PrimaryButton type="button" variant="ghost" disabled={step === 1} onClick={() => setStep(step - 1)} testId="button-step-back">Zurück</PrimaryButton>
        {step < 6 ? (
          step > 1 && <PrimaryButton type="button" pending={save.isPending} onClick={() => advance(step + 1)} testId="button-step-next">Weiter</PrimaryButton>
        ) : (
          <PrimaryButton type="button" pending={save.isPending} onClick={() => advance(6, onFinish)} testId="button-save-draft">Als Entwurf speichern und zum Dashboard</PrimaryButton>
        )}
      </div>
    </div>
  );
}
