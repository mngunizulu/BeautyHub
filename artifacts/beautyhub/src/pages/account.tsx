import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { useClerk } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Building2, CreditCard, Download, ExternalLink, ShieldAlert } from 'lucide-react';
import {
  useGetMyProfile, getGetMyProfileQueryKey, useUpdateMyProfile, exportMyData,
  useRequestAccountDeletion, useWithdrawMyDeletionRequest, useListMyPaymentMethods, getListMyPaymentMethodsQueryKey,
  useListMyOrganizations, getListMyOrganizationsQueryKey, getGetSessionQueryKey,
} from '@workspace/api-client-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Check, Field, FormStatus, Panel, PrimaryButton, inputCls } from '@/components/forms';
import { ErrorState } from '@/components/site';
import { CustomerPackages } from '@/components/service-packages';
import { LoyaltyBalances } from '@/components/loyalty';
import { BusinessMarketingPreferences } from '@/components/marketing';
import { AccountBookings } from '@/components/booking';
import { FavoritesPanel } from '@/components/favorites';
import { AuthSkeleton } from '@/lib/auth';
import { errorText, roleLabel } from '@/lib/api';

export default function AccountPage() {
  const profile = useGetMyProfile({ query: { queryKey: getGetMyProfileQueryKey() } });
  if (profile.isLoading) return <AuthSkeleton />;
  if (profile.isError || !profile.data) return <div className="mx-auto max-w-3xl px-5 pt-12"><ErrorState title="Konto konnte nicht geladen werden." onRetry={() => profile.refetch()} /></div>;
  const p = profile.data;
  return (
    <div className="mx-auto max-w-6xl px-5 pt-10">
      <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground rise">Mein Konto</p>
      <h1 className="mt-2 font-display text-5xl sm:text-6xl rise" data-testid="text-account-heading">Hallo, <span className="italic text-primary">{p.displayName || 'du'}.</span></h1>
      {p.isPlatformAdmin && <Link href="/admin/bewertungen" className="mt-4 inline-block underline">Bewertungsmoderation</Link>}
      <Link href="/konto/support" className="mt-4 inline-block underline">Meine Supportanfragen</Link>
      {p.isPlatformAdmin && <Link href="/admin/plattform" className="ml-4 mt-4 inline-block underline">Plattformübersicht</Link>}
      {p.isPlatformAdmin && <Link href="/admin/support" className="ml-4 mt-4 inline-block underline">Supportfälle</Link>}
      {p.isPlatformAdmin && <Link href="/admin/kunden" className="ml-4 mt-4 inline-block underline">Kundenkonten</Link>}
      {p.isPlatformAdmin && <Link href="/admin/betriebe" className="ml-4 mt-4 inline-block underline">Betriebe verwalten</Link>}
      {p.isPlatformAdmin && <Link href="/admin/tarife" className="ml-4 mt-4 inline-block underline">Geschäftstarife verwalten</Link>}
      {p.deletionRequested && <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm" data-testid="text-deletion-pending">Deine Löschanfrage liegt vor und wird geprüft. Bis zur Bearbeitung bleibt dein Konto nutzbar.</p>}
      <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <ProfileForm />
          <AccountBookings />
          <LoyaltyBalances />
          <CustomerPackages />
          <BusinessMarketingPreferences />
          <FavoritesPanel />
          <OrganizationsTeaser />
        </div>
        <div className="space-y-6">
          <PaymentPanel />
          <DataPanel deletionRequested={p.deletionRequested} requestedAt={p.deletionRequestedAt ?? null} />
        </div>
      </div>
    </div>
  );
}

function ProfileForm() {
  const qc = useQueryClient();
  const { openUserProfile } = useClerk();
  const { data: p } = useGetMyProfile({ query: { queryKey: getGetMyProfileQueryKey() } });
  const update = useUpdateMyProfile();
  const [form, setForm] = useState({ displayName: '', phone: '', emailNotifications: true, marketingConsent: false });
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const init = useRef<string | null>(null);
  useEffect(() => {
    if (p && init.current !== p.id) {
      init.current = p.id;
      setForm({ displayName: p.displayName, phone: p.phone, emailNotifications: p.emailNotifications, marketingConsent: p.marketingConsent });
    }
  }, [p]);
  if (!p) return null;
  const nameErr = form.displayName.trim().length === 0 ? 'Bitte gib einen Anzeigenamen an.' : form.displayName.length > 100 ? 'Höchstens 100 Zeichen.' : null;
  const phoneErr = form.phone && !/^[+0-9 ()/-]{4,30}$/.test(form.phone) ? 'Nur Ziffern, Leerzeichen und + ( ) / - erlaubt.' : null;
  const submit = (e: FormEvent) => {
    e.preventDefault(); setErr(null); setOk(null);
    if (nameErr || phoneErr) { setErr('Bitte prüfe die markierten Felder.'); return; }
    update.mutate({ data: { displayName: form.displayName.trim(), phone: form.phone.trim(), emailNotifications: form.emailNotifications, marketingConsent: form.marketingConsent } }, {
      onSuccess: (u) => { qc.setQueryData(getGetMyProfileQueryKey(), u); qc.invalidateQueries({ queryKey: getGetSessionQueryKey() }); setOk('Profil gespeichert.'); },
      onError: (e2) => setErr(errorText(e2)),
    });
  };
  return (
    <Panel title="Profil & Einstellungen" kicker="Persönlich">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field id="account-email" label="E-Mail-Adresse" hint={p.emailVerified ? 'Bestätigt. Wird über deinen Anmeldeanbieter verwaltet.' : 'Noch nicht bestätigt. Wird über deinen Anmeldeanbieter verwaltet.'}>
          <div className="flex gap-2">
            <input id="account-email" value={p.email} readOnly className={`${inputCls} bg-muted`} data-testid="input-email" />
            <button type="button" onClick={() => openUserProfile()} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 text-sm hover:bg-secondary" data-testid="button-provider-settings"><ExternalLink className="h-3.5 w-3.5" />Anmeldedaten</button>
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="account-name" label="Anzeigename" error={nameErr}>
            <input id="account-name" value={form.displayName} maxLength={100} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className={inputCls} aria-invalid={!!nameErr} data-testid="input-display-name" />
          </Field>
          <Field id="account-phone" label="Telefon (optional)" error={phoneErr}>
            <input id="account-phone" type="tel" value={form.phone} maxLength={30} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+49 30 1234567" className={inputCls} data-testid="input-phone" />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Check id="email-notifications" label="E-Mail-Benachrichtigungen" hint="Hinweise zu deinem Konto und deinen Betrieben" checked={form.emailNotifications} onChange={(v) => setForm({ ...form, emailNotifications: v })} />
          <Check id="marketing-consent" label="Neuigkeiten von BeautyHub" hint="Jederzeit widerrufbar" checked={form.marketingConsent} onChange={(v) => setForm({ ...form, marketingConsent: v })} />
        </div>
        <FormStatus error={err} success={ok} />
        <PrimaryButton pending={update.isPending} testId="button-save-profile">Speichern</PrimaryButton>
      </form>
    </Panel>
  );
}

function OrganizationsTeaser() {
  const orgs = useListMyOrganizations({ query: { queryKey: getListMyOrganizationsQueryKey() } });
  return (
    <Panel title="Meine Betriebe" kicker="Mitgliedschaften" actions={<Link href="/unternehmen" className="inline-flex items-center gap-1 text-sm text-primary hover:underline" data-testid="link-organizations">Alle verwalten<ArrowUpRight className="h-3.5 w-3.5" /></Link>}>
      {orgs.isLoading ? <div className="h-16 animate-pulse rounded-xl bg-muted" /> : orgs.isError ? <ErrorState onRetry={() => orgs.refetch()} /> : orgs.data?.length ? (
        <ul className="divide-y divide-dashed divide-border">
          {orgs.data.map((o) => (
            <li key={o.id}><Link href={`/unternehmen/${o.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-primary" data-testid={`link-org-${o.id}`}>
              <span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-accent" />{o.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{roleLabel[o.role] ?? o.role} · {o.published ? 'veröffentlicht' : 'Entwurf'}</span>
            </Link></li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-muted-foreground">Du bist noch in keinem Betrieb Mitglied. <Link href="/unternehmen?neu=1" className="text-primary underline" data-testid="link-create-org">Betrieb anlegen</Link></div>
      )}
    </Panel>
  );
}

function PaymentPanel() {
  const pm = useListMyPaymentMethods({ query: { queryKey: getListMyPaymentMethodsQueryKey() } });
  return (
    <Panel title="Zahlungsmethoden" kicker="Vorbereitet">
      <div className="rounded-xl bg-secondary/70 p-4 text-sm demo-stripe">
        <p className="flex items-center gap-2 font-semibold"><CreditCard className="h-4 w-4" />Noch keine Karten hinterlegbar</p>
        <p className="mt-1 text-muted-foreground">Karten werden später ausschließlich über einen zertifizierten Zahlungsanbieter gespeichert. BeautyHub sieht oder speichert niemals Kartennummern oder Prüfziffern. Bis dahin gibt es hier bewusst kein Eingabefeld.</p>
      </div>
      <div className="mt-4" data-testid="list-payment-methods">
        {pm.isLoading ? <div className="h-10 animate-pulse rounded-xl bg-muted" /> : pm.isError ? <p className="text-sm text-destructive">{errorText(pm.error)} <button className="underline" onClick={() => pm.refetch()}>Erneut</button></p> : pm.data?.length ? (
          <ul className="space-y-2 text-sm">{pm.data.map((m) => <li key={m.id} className="rounded-xl border border-border px-3 py-2">{m.provider === 'beautyhub-simulated' ? 'Simulierte Zahlungsmethode · keine Abbuchung' : `${m.provider} · ${m.status}`}</li>)}</ul>
        ) : <p className="text-sm text-muted-foreground">Keine Zahlungsreferenzen vorhanden.</p>}
      </div>
      <button disabled className="mt-4 w-full cursor-not-allowed rounded-full border border-border px-5 py-2.5 text-sm opacity-60" data-testid="button-add-card-disabled">Karte hinzufügen · folgt mit Zahlungsanbieter</button>
    </Panel>
  );
}

function DataPanel({ deletionRequested, requestedAt }: { deletionRequested: boolean; requestedAt: string | null }) {
  const qc = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const del = useRequestAccountDeletion();
  const withdraw = useWithdrawMyDeletionRequest({ mutation: {
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
      setMsg('Löschanfrage zurückgezogen.');
    },
    onError: (error) => setErr(errorText(error)),
  } });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const download = async () => {
    setErr(null); setMsg(null);
    setExporting(true);
    try {
      const data = await exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'beautyhub-datenexport.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg('Export heruntergeladen.');
    } catch (error) {
      setErr(errorText(error, 'Export fehlgeschlagen.'));
    } finally {
      setExporting(false);
    }
  };
  const requestDeletion = () => {
    setErr(null); setMsg(null);
    del.mutate(undefined, {
      onSuccess: (r) => { setMsg(r.message); qc.invalidateQueries({ queryKey: getGetMyProfileQueryKey() }); },
      onError: (e) => setErr(errorText(e)),
    });
  };
  return (
    <Panel title="Deine Daten" kicker="DSGVO">
      <p className="text-sm text-muted-foreground">Lade deine Profildaten, Mitgliedschaften und kontobezogenen Vorgänge als JSON-Datei herunter.</p>
      <div className="mt-3"><PrimaryButton type="button" variant="ghost" pending={exporting} onClick={download} testId="button-export-data"><Download className="h-4 w-4" />Daten exportieren</PrimaryButton></div>
      <div className="mt-6 border-t border-dashed border-border pt-5">
        <p className="flex items-center gap-2 text-sm font-semibold"><ShieldAlert className="h-4 w-4 text-destructive" />Konto löschen</p>
        <p className="mt-1 text-sm text-muted-foreground">Du stellst eine Löschanfrage. Sie wird geprüft, bevor Daten entfernt werden — zum Beispiel, wenn du noch Inhaber:in eines Betriebs bist.</p>
        {requestedAt && <button type="button" className="mt-3 block underline" disabled={withdraw.isPending}
          onClick={() => { setErr(null); setMsg(null); withdraw.mutate({ data: { requestedAt } }); }}>Löschanfrage zurückziehen</button>}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button disabled={deletionRequested || del.isPending} className="mt-3 rounded-full border border-destructive/40 px-5 py-2.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50" data-testid="button-request-deletion">{deletionRequested ? 'Löschung beantragt' : 'Löschung beantragen'}</button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display text-2xl">Löschung wirklich beantragen?</AlertDialogTitle>
              <AlertDialogDescription>Wir prüfen die Anfrage und entfernen danach deine personenbezogenen Daten. Das Konto wird nicht sofort gelöscht.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-deletion">Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={requestDeletion} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-deletion">Ja, beantragen</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <div className="mt-4"><FormStatus error={err} success={msg} /></div>
    </Panel>
  );
}
