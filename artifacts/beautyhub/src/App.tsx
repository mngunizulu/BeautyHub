import { lazy, Suspense, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, Show } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Home from '@/pages/home';
import { ForBusiness, SystemPage } from '@/pages/info';
import { AnmeldenRedirect, SignInPage, SignUpPage } from '@/pages/auth';
import { Layout } from '@/components/site';
import { PageMetadata } from '@/components/page-metadata';
import { ClerkQueryClientCacheInvalidator, RequireAuth, SessionExpiryWatcher, basePath, clerkAppearance, clerkLocalization, stripBase } from '@/lib/auth';

const PlatformHomepageGallery = lazy(() => import('@/pages/platform-homepage-gallery'));
const PlatformOverview = lazy(() => import('@/pages/platform-overview'));
const SupportPage = lazy(() => import('@/pages/support'));
const PlatformCustomers = lazy(() => import('@/pages/platform-customers'));
const PlatformBusinesses = lazy(() => import('@/pages/platform-businesses'));
const ReviewModerationPage = lazy(() => import('@/pages/review-moderation'));
const Salons = lazy(() => import('@/pages/salons'));
const SalonDetail = lazy(() => import('@/pages/salon-detail'));
const AccountPage = lazy(() => import('@/pages/account'));
const OrganizationsPage = lazy(() => import('@/pages/organizations'));
const WorkspacePage = lazy(() => import('@/pages/workspace'));
const InvitationPage = lazy(() => import('@/pages/invitation'));
const PlatformPlanSettings = lazy(() => import('@/components/saas-plans').then((module) => ({ default: module.PlatformPlanSettings })));

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

const CustomerSupport = () => <RequireAuth><SupportPage /></RequireAuth>;
const AdminHomepageGallery = () => <RequireAuth><PlatformHomepageGallery /></RequireAuth>;
const AdminOverview = () => <RequireAuth><PlatformOverview /></RequireAuth>;
const AdminSupport = () => <RequireAuth><SupportPage admin /></RequireAuth>;
const AdminCustomers = () => <RequireAuth><PlatformCustomers /></RequireAuth>;
const AdminBusinesses = () => <RequireAuth><PlatformBusinesses /></RequireAuth>;
const AdminPlans = () => <RequireAuth><PlatformPlanSettings /></RequireAuth>;
const ReviewModeration = () => <RequireAuth><ReviewModerationPage /></RequireAuth>;
const Account = () => <RequireAuth><AccountPage /></RequireAuth>;
const Organizations = () => <RequireAuth><OrganizationsPage /></RequireAuth>;
const Workspace = () => <RequireAuth><WorkspacePage /></RequireAuth>;

function Router() {
  return (
    <Layout>
      <RoutedErrorBoundary>
        <Suspense fallback={<p role="status" className="mx-auto max-w-7xl px-5 py-10">Seite wird geladen …</p>}>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/salons" component={Salons} />
            <Route path="/salons/:slug" component={SalonDetail} />
            <Route path="/fuer-unternehmen" component={ForBusiness} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/anmelden" component={AnmeldenRedirect} />
            <Route path="/signin" component={AnmeldenRedirect} />
            <Route path="/konto/support" component={CustomerSupport} />
            <Route path="/admin/plattform" component={AdminOverview} />
            <Route path="/admin/startseite" component={AdminHomepageGallery} />
            <Route path="/admin/support" component={AdminSupport} />
            <Route path="/admin/kunden" component={AdminCustomers} />
            <Route path="/admin/betriebe" component={AdminBusinesses} />
            <Route path="/admin/tarife" component={AdminPlans} />
            <Route path="/admin/bewertungen" component={ReviewModeration} />
            <Route path="/konto" component={Account} />
            <Route path="/unternehmen" component={Organizations} />
            <Route path="/unternehmen/:organizationId" component={Workspace} />
            <Route path="/einladung" component={InvitationPage} />
            <Route path="/system" component={SystemPage} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
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
