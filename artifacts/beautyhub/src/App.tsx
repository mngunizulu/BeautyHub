import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, Show } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Home from '@/pages/home';
import Salons from '@/pages/salons';
import SalonDetail from '@/pages/salon-detail';
import { ForBusiness, SystemPage } from '@/pages/info';
import { AnmeldenRedirect, SignInPage, SignUpPage } from '@/pages/auth';
import AccountPage from '@/pages/account';
import OrganizationsPage from '@/pages/organizations';
import WorkspacePage from '@/pages/workspace';
import InvitationPage from '@/pages/invitation';
import { Layout } from '@/components/site';
import { PageMetadata } from '@/components/page-metadata';
import { ClerkQueryClientCacheInvalidator, RequireAuth, SessionExpiryWatcher, basePath, clerkAppearance, clerkLocalization, stripBase } from '@/lib/auth';

// REQUIRED — copy verbatim.
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — copy verbatim. Empty in dev, auto-set in prod.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      refetchOnWindowFocus: false,
      retry: (n, e) => {
        const s = (e as { status?: number } | null)?.status;
        if (s === 401 || s === 403 || s === 404) return false;
        return n < 2;
      },
    },
  },
});

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in"><Redirect to="/konto" /></Show>
      <Show when="signed-out"><Home /></Show>
    </>
  );
}

const Account = () => <RequireAuth><AccountPage /></RequireAuth>;
const Organizations = () => <RequireAuth><OrganizationsPage /></RequireAuth>;
const Workspace = () => <RequireAuth><WorkspacePage /></RequireAuth>;

function Router() {
  return (
    <Layout>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/salons" component={Salons} />
          <Route path="/salons/:slug" component={SalonDetail} />
          <Route path="/fuer-unternehmen" component={ForBusiness} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/anmelden" component={AnmeldenRedirect} />
          <Route path="/signin" component={AnmeldenRedirect} />
          <Route path="/konto" component={Account} />
          <Route path="/unternehmen" component={Organizations} />
          <Route path="/unternehmen/:organizationId" component={Workspace} />
          <Route path="/einladung" component={InvitationPage} />
          <Route path="/system" component={SystemPage} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Layout>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={clerkLocalization}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <SessionExpiryWatcher />
          <PageMetadata />
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
