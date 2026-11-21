import type { ReactNode } from 'react';
import { SignIn, SignUp, useAuth } from '@clerk/react';
import { Redirect } from 'wouter';
import { basePath } from '@/lib/auth';

function AuthFrame({ children, kicker, title }: { children: ReactNode; kicker: string; title: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-12 md:grid-cols-[1fr_1fr] md:py-20">
      <div className="hidden md:block rise">
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{kicker}</p>
        <h1 className="mt-3 font-display text-6xl leading-[0.95]">{title}</h1>
        <ul className="mt-8 space-y-3 text-muted-foreground">
          <li>Profil und Benachrichtigungen an einem Ort.</li>
          <li>Eigene Betriebe anlegen, Schritt für Schritt einrichten, später weitermachen.</li>
          <li>Passwort vergessen? Die Wiederherstellung läuft direkt über das Anmeldefenster.</li>
        </ul>
      </div>
      <div className="flex justify-center rise" style={{ animationDelay: '120ms' }}>{children}</div>
    </div>
  );
}

export function SignInPage() {
  return (
    <AuthFrame kicker="Anmelden" title={<>Schön, dass du <span className="italic text-primary">wieder da bist.</span></>}>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={`${basePath}/konto`} />
    </AuthFrame>
  );
}

export function SignUpPage() {
  return (
    <AuthFrame kicker="Registrieren" title={<>Ein Konto, <span className="italic text-primary">viele Rollen.</span></>}>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} fallbackRedirectUrl={`${basePath}/konto`} />
    </AuthFrame>
  );
}

/** Legacy Stage 1 URL: forwards to the real sign-in, or to the account when already signed in. */
export function AnmeldenRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <div className="mx-auto mt-16 h-40 max-w-md animate-pulse rounded-2xl bg-muted" aria-busy="true" />;
  return <Redirect to={isSignedIn ? '/konto' : '/sign-in'} replace />;
}
