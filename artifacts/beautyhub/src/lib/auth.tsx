import { useEffect, useRef, type ReactNode } from 'react';
import { useAuth, useClerk } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { Redirect } from 'wouter';
import { shadcn } from '@clerk/themes';
import { deDE } from '@clerk/localizations';
import { useToast } from '@/hooks/use-toast';

export const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

export const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: 'hsl(332 45% 26%)',
    colorForeground: 'hsl(330 35% 14%)',
    colorMutedForeground: 'hsl(330 12% 38%)',
    colorDanger: 'hsl(4 70% 45%)',
    colorBackground: 'hsl(32 50% 98%)',
    colorInput: 'hsl(30 40% 96%)',
    colorInputForeground: 'hsl(330 35% 14%)',
    colorNeutral: 'hsl(330 35% 14%)',
    fontFamily: "'Bricolage Grotesque', sans-serif",
    borderRadius: '0.875rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-card rounded-[1.5rem] w-[440px] max-w-full overflow-hidden border border-border shadow-[0_30px_60px_-35px_hsl(332_45%_26%/.55)]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'font-display text-3xl text-foreground',
    headerSubtitle: 'text-muted-foreground',
    socialButtonsBlockButtonText: 'text-foreground font-medium',
    formFieldLabel: 'text-foreground',
    footerActionLink: 'text-primary font-semibold hover:text-primary/80',
    footerActionText: 'text-muted-foreground',
    dividerText: 'text-muted-foreground',
    identityPreviewEditButton: 'text-primary',
    formFieldSuccessText: 'text-foreground',
    alertText: 'text-foreground',
    logoBox: 'justify-center',
    logoImage: 'h-12 w-12',
    socialButtonsBlockButton: 'border border-border bg-background hover:bg-secondary',
    formButtonPrimary: 'bg-primary text-primary-foreground rounded-full hover:bg-primary/90',
    formFieldInput: 'bg-background border-input text-foreground',
    footerAction: 'bg-secondary/60',
    dividerLine: 'bg-border',
    alert: 'border border-destructive/30 bg-destructive/5',
    otpCodeFieldInput: 'border-input text-foreground',
    formFieldRow: 'gap-2',
    main: 'gap-5',
  },
};

export const clerkLocalization = {
  ...deDE,
  signIn: {
    ...deDE.signIn,
    start: { ...deDE.signIn?.start, title: 'Willkommen zurück', subtitle: 'Melde dich bei BeautyHub an' },
  },
  signUp: {
    ...deDE.signUp,
    start: { ...deDE.signUp?.start, title: 'Konto anlegen', subtitle: 'Ein Konto für Termine, Profil und deinen Betrieb' },
  },
};

/** Clears all cached data whenever the signed-in identity changes. */
export function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);
  return null;
}

/** When the API answers 401 while Clerk believes we are signed in, the session expired: sign out and go to sign-in. */
export function SessionExpiryWatcher() {
  const { isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const qc = useQueryClient();
  const { toast } = useToast();
  const signedInRef = useRef(isSignedIn); signedInRef.current = isSignedIn;
  const signOutRef = useRef(signOut); signOutRef.current = signOut;
  const toastRef = useRef(toast); toastRef.current = toast;
  const firing = useRef(false);
  useEffect(() => {
    const handle = (err: unknown) => {
      if ((err as { status?: number } | null)?.status !== 401 || !signedInRef.current || firing.current) return;
      firing.current = true;
      toastRef.current({ title: 'Sitzung abgelaufen', description: 'Bitte melde dich erneut an.' });
      void signOutRef.current({ redirectUrl: `${basePath}/sign-in` }).finally(() => { firing.current = false; });
    };
    const u1 = qc.getQueryCache().subscribe((e) => { if (e.type === 'updated' && e.action.type === 'error') handle(e.action.error); });
    const u2 = qc.getMutationCache().subscribe((e) => { if (e.type === 'updated' && e.action.type === 'error') handle(e.action.error); });
    return () => { u1(); u2(); };
  }, [qc]);
  return null;
}

export function AuthSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-5 pt-12" aria-busy="true" aria-label="Wird geladen">
      <div className="h-12 w-72 animate-pulse rounded-xl bg-muted" />
      <div className="mt-8 grid gap-6 md:grid-cols-[240px_1fr]">
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}

/** Waits for Clerk to load; signed-out users go to sign-in with a return path (path only, never secrets). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <AuthSkeleton />;
  if (!isSignedIn) {
    const back = `${window.location.pathname}`;
    return <Redirect to={`/sign-in?redirect_url=${encodeURIComponent(back)}`} />;
  }
  return <>{children}</>;
}
