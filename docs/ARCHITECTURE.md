# Architecture

## Modular monolith
One product with React frontend and one Express API, independently built packages but no microservice domain split. Replit's path proxy serves frontend `/` and backend `/api`. All browser API requests are relative, typed and generated from OpenAPI. Future consumer/business/admin areas share this API and its domain services.

`React → generated TanStack Query client → Express routes → validation → domain policy/service → repository → Drizzle/PostgreSQL`.

Routes are split into catalog, foundation and health. Thin catalog handlers validate generated Zod schemas; repository methods explicitly project only published public fields. Security middleware precedes routes; errors expose only structured generic messages. JSON/form body caps, Helmet, rate limiting, same-origin access and sanitized request logs apply centrally. API listener uses the injected port and `0.0.0.0`; shutdown closes listener and pool.

## Implemented data model
- `users`: opaque verified-provider identity mapping, internal UUID and default-false platform-administrator marker. No password or consumer PII columns yet.
- `organizations`: tenant identity; demo flag is explicit.
- `business_memberships`: unique user/organization pair with constrained owner/manager/employee role and foreign keys.
- `service_categories`: stable unique slugs and presentation order.
- `locations`: organization/category references, unique public slug, public profile fields, published flag, timezone and indexed public-city/category lookup.
- `services`: location-scoped public catalog with published flag, positive duration and nonnegative integer euro cents.
- `opening_hours`: unique weekday per location, ordered valid HH:mm bounds.

No private tenant endpoint reads data in Stage 1. The users/memberships schema is an identity foundation, not a completed authentication flow. App-level permission policy is tested but must be connected to verified managed identity and membership loading in Stage 2.

Migrations are checked into `lib/db/drizzle/`. Run development migration generation/application explicitly; never DDL on API startup. Seed is development-only, transactional and idempotent, using stable synthetic IDs. No actual users or admin accounts are seeded. Production schema changes use the approved Replit Publish flow, not these development commands.

## Authentication boundary
Clerk management check returned **not configured**. Clerk is the planned managed provider; Stage 2 activates it. `/api/auth/session` truthfully returns guest/not configured. The entire `/api/business` and `/api/admin` namespaces reject every caller with 401, regardless of headers/cookies/tenant IDs. No local password or ad hoc token scheme.

Future chain: verified provider identity → internal user → DB memberships → organization/location-scoped permissions. Never construct a Principal from browser claims. Ordinary business owners cannot administer the platform. Admin status alone does not grant salon-private CRM access. Full authenticated IDOR/tenant tests arrive with these operations.

## API contract
`lib/api-spec/openapi.yaml` is the source of truth; run codegen after edits. Routes:

| GET path (under `/api`) | Semantics |
|---|---|
| `/healthz` | Real database probe, 200 connected or 503 degraded; timestamp/version |
| `/categories` | Category names and actual published-business counts |
| `/businesses?q=&city=&category=` | All filters ANDed; literal case-insensitive name/description/service and city search, category exact; capped at 100 |
| `/businesses/{slug}` | Published-only profile, published services and opening hours, or 404 |
| `/marketplace/summary` | Real public catalog counts and available cities |
| `/system` | Public capabilities and ten-stage roadmap |
| `/auth/session` | No-store guest capability report |
| `/business/workspace`, `/admin/workspace` | 401; no anonymous private access |

Search rejects unknown/malformed/overlong query inputs. Pattern metacharacters are escaped and values bound by ORM. Public projections omit tenant ownership IDs and identity data. Errors use `{error,code}` with 400/401/404/413/429/500 as appropriate. Health has a bounded DB connection/query timeout.

## Frontend and localization
Routes: `/`, `/salons`, `/salons/:slug`, `/fuer-unternehmen`, `/anmelden`, `/system`. Query filters live in URL; fetched data has query keys, loading/error/empty states and navigation/refetch paths. Shared theme, layout, cards and controls are local reusable components. Locale formatting is centralized in `src/lib/format.ts`. German copy is current; future English needs message catalogs extracted before translated screens, never duplicated domain logic. Stock images are not third-party placeholders: generated local images depict fictional businesses and are illustrative only.

## Future module boundaries
Stage 2 identity/onboarding/team permissions; Stage 3 full marketplace/favorites/uploads; Stage 4 scheduling/appointments/resources/notifications; Stage 5 business calendar/CRM/team; Stage 6 provider-abstracted finance/POS; Stage 7 inventory; Stage 8 marketing/loyalty/reviews; Stage 9 reporting/SaaS/platform administration; Stage 10 release integration and security/privacy/performance/accessibility.

Store UTC instants with location IANA zones; calendar-only dates as strings/date columns. Scheduling must account for Berlin DST and enforce exclusive overlap transactionally in PostgreSQL. Cancellation/edit/AI actions must all call the same booking engine. Financial values use integer cents and financial/stock mutations need idempotency.

Uploads will use approved persistent object storage, with only metadata in PostgreSQL, safe upload validation and scoped download authorization. Messages/payments remain explicit development simulations until authorized. No production compliance, backup recovery or paid integration is assumed.
