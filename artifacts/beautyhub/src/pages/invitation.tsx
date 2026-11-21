import { useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { SignIn, useAuth, useUser } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import { useAcceptStaffInvitation, getListMyOrganizationsQueryKey, type OrganizationSummary } from '@workspace/api-client-react';
import { FormStatus, PrimaryButton } from '@/components/forms';
import { AuthSkeleton, basePath } from '@/lib/auth';
import { errorText, roleLabel } from '@/lib/api';

/**
 * The invitation token lives only in the URL fragment (#token=...), which browsers never send to servers.
 * It is held in memory only (never logged or written to storage) so it survives in-app sign-in navigation.
 */
let memoryToken: string | null = null;
function readToken(): string | null {
  const m = /(?:^|[#&])token=([^&]+)/.exec(window.location.hash);
  if (m) {
    try { memoryToken = decodeURIComponent(m[1]); }
    catch { memoryToken = null; }
  }
  return memoryToken;
}
function forgetToken() {
  memoryToken = null;
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

export default function InvitationPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const qc = useQueryClient();
  const [token] = useState(readToken);
  const accept = useAcceptStaffInvitation();
  const [org, setOrg] = useState<OrganizationSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!isLoaded) return <AuthSkeleton />;

  const shell = (children: ReactNode) => (
    <div className="mx-auto max-w-xl px-5 pt-14">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/30 rise"><MailCheck className="h-6 w-6 text-primary" /></div>
      <h1 className="mt-5 text-center font-display text-5xl rise">Einladung <span className="italic text-primary">annehmen</span></h1>
      <div className="mt-8">{children}</div>
    </div>
  );

  if (org) return shell(
    <div className="rounded-[1.4rem] border border-border bg-card p-7 text-center" data-testid="state-invitation-accepted">
      <p className="font-display text-2xl">Willkommen bei {org.name}.</p>
      <p className="mt-2 text-sm text-muted-foreground">Deine Rolle: {roleLabel[org.role] ?? org.role}</p>
      <Link href={`/unternehmen/${org.id}`} className="mt-5 inline-flex rounded-full bg-primary px-6 py-3 text-primary-foreground" data-testid="link-open-organization">Zum Betrieb</Link>
    </div>,
  );

  if (!token || token.length < 32) return shell(
    <div className="rounded-[1.4rem] border border-dashed border-border bg-card p-7 text-center" data-testid="state-invitation-missing">
      <p className="font-display text-2xl">Kein gültiger Einladungslink.</p>
      <p className="mt-2 text-sm text-muted-foreground">Öffne den vollständigen Link, den du von deinem Betrieb erhalten hast. Er endet mit „#token=…“.</p>
    </div>,
  );

  if (!isSignedIn) return shell(
    <div className="space-y-5">
      <p className="text-center text-muted-foreground">Melde dich mit der E-Mail-Adresse an, an die die Einladung gerichtet ist. Danach kannst du sie annehmen.</p>
      <div className="flex justify-center">
        <SignIn routing="hash" forceRedirectUrl={`${basePath}/einladung`} signUpUrl={`${basePath}/sign-up`} />
      </div>
      <p className="text-center text-xs text-muted-foreground">Noch kein Konto? Registriere dich und öffne den Einladungslink danach erneut.</p>
    </div>,
  );

  const submit = () => {
    setErr(null);
    accept.mutate({ data: { token } }, {
      onSuccess: (o) => { forgetToken(); setOrg(o); qc.invalidateQueries({ queryKey: getListMyOrganizationsQueryKey() }); },
      onError: (e) => setErr(errorText(e, 'Die Einladung ist ungültig, abgelaufen oder für eine andere E-Mail-Adresse bestimmt.')),
    });
  };

  return shell(
    <div className="rounded-[1.4rem] border border-border bg-card p-7">
      <p className="text-sm text-muted-foreground">Angemeldet als</p>
      <p className="font-semibold" data-testid="text-invitation-user">{user?.primaryEmailAddress?.emailAddress}</p>
      <p className="mt-4 text-sm text-muted-foreground">Die Einladung wird nur angenommen, wenn sie an diese Adresse gerichtet ist. Sie ist einmalig nutzbar und läuft ab.</p>
      <div className="mt-5"><FormStatus error={err} /></div>
      <div className="mt-5"><PrimaryButton type="button" onClick={submit} pending={accept.isPending} testId="button-accept-invitation">Einladung annehmen</PrimaryButton></div>
    </div>,
  );
}
