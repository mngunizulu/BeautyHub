# Architecture

## Modular monolith
One product with React frontend and one Express API, independently built packages but no microservice domain split. Replit's path proxy serves frontend `/` and backend `/api`. All browser API requests are relative, typed and generated from OpenAPI. Future consumer/business/admin areas share this API and its domain services.

`React → generated TanStack Query client → Express routes → validation → domain policy/service → repository → Drizzle/PostgreSQL`.

Routes are split into catalog, foundation and health. Thin catalog handlers validate generated Zod schemas; repository methods explicitly project only published public fields. Security middleware precedes routes; errors expose only structured generic messages. JSON/form body caps, Helmet, rate limiting, same-origin access and sanitized request logs apply centrally. API listener uses the injected port and `0.0.0.0`; shutdown closes listener and pool.

## Implemented data model
- `users`: unique managed-provider identity, internal UUID, verified email, editable display name/phone/preferences, deletion-request timestamp and trusted default-false administrator marker. No passwords.
- `organizations`: tenant identity, business contacts/description and resumable onboarding step; demo flag explicit.
- `business_memberships`: unique user/organization pair, constrained owner/manager/employee roles and active/inactive/removed status.
- `service_categories`: preserved Stage 1 platform business-category definitions, stable slugs/order. `business_service_categories` are distinct organization-owned service groupings.
- `locations`: structured DE address/optional coordinates, timezone, lead/advance booking settings, unique public slug and controlled publication; no Berlin restriction.
- `employees`: organization/location profiles, optional linked identity, active state and validated weekly working-schedule templates. `employee_services` stores explicit service eligibility.
- `services` and stable `service_variants`: integer cents, duration/buffers, publication/online eligibility, group references and soft archival (no loss of historical identifiers).
- `opening_hours`: unique weekday per location, ordered valid HH:mm bounds.
- `cancellation_policies`: immutable organization-scoped versions; configurable defaults 24h/100% late/100% no-show, fixed/percentage fees, waiver/exception settings. `policy_acceptances` reserves explicit timestamped snapshots for future booking consent.
- `staff_invitations`: hash-only, recipient-bound, 72-hour single-use invitations; creator authorization rechecked at acceptance. Sensitive operations have `audit_events`.
- `payment_provider_references`: opaque customer-provider association only; user-scoped read projection, no raw card fields or card-save API.

Stage 2 uses managed identity followed by DB-backed membership loading for every tenant request. Employee views are reduced to their own employee records, without membership/invitation listings. Owners/managers administer profiles/staff/services; only owners publish or change memberships, and managers cannot invite managers. Cross-tenant nested IDs are checked before mutations.

Migrations are checked into `lib/db/drizzle/`. Run development migration generation/application explicitly; never DDL on API startup. Seed is development-only, transactional and idempotent, using stable synthetic IDs. No actual users or admin accounts are seeded. Production schema changes use the approved Replit Publish flow, not these development commands.

## Authentication boundary
Managed Clerk was provisioned for Stage 2 and owns registration, sign-in, verification, recovery and sessions. Backend Clerk middleware verifies provider identity; a unique external-ID bridge prevents duplicate internal users. Returning profile/session requests refresh provider-owned email verification without overriding the user's local display name/preferences. Browser APIs use managed same-origin cookies, never caller identity headers or custom local JWTs.

Verified provider identity → internal user → active DB membership → route role/organization/nested-ID checks. Platform administrator assignment has no public/self-service endpoint: a trusted operator must explicitly assign it separately. Admin status alone does not grant salon-private access. Same-origin/Fetch-Metadata checks reject cross-site mutations; private responses are no-store. Authenticated IDOR/role/revocation tests use the real DB with only the external Clerk boundary mocked.

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
| `/auth/session` | No-store guest or verified internal-user session |
| `/me`, `/me/export`, `/me/payment-methods` | Own profile, export foundation and safe provider references; auth required |
| `/organizations`, `/organizations/{id}/workspace` | Active memberships and tenant-scoped business workspace |

Protected mutations include profile/preferences/deletion requests; organization/profile/location/hours/staff/service/category/policy/publication administration; hashed invitation creation/verified acceptance; owner-only membership updates. The OpenAPI document specifies exact verbs, payloads and generated clients.

Search rejects unknown/malformed/overlong query inputs. Pattern metacharacters are escaped and values bound by ORM. Public projections omit tenant ownership IDs and identity data. Errors use `{error,code}` with 400/401/404/413/429/500 as appropriate. Health has a bounded DB connection/query timeout.

## Frontend and localization
Public routes remain `/`, `/salons`, `/salons/:slug`, `/fuer-unternehmen`, `/system`. Managed `/sign-in/*?` and `/sign-up/*?` handle auth; `/anmelden` is an alias. Protected `/konto`, `/unternehmen`, `/unternehmen/:organizationId` provide the customer portal, organization list and resumable six-step wizard/editable dashboard; `/einladung#token=…` accepts a manually shared invitation. Signed-in root redirects to the portal; logout returns to public root. Identity changes clear query caches, and expired sessions redirect safely. Query filters/current dashboard section live in URLs; data has loading/error/empty/retry states. Shared existing theme, layout/cards/controls and German currency/date formatting are retained. Future English needs extracted message catalogs, not duplicated domain logic. Generated images illustrate fictional seed studios; new business images are illustrative, not verified venue photographs.

## Future module boundaries
Stage 2 implements identity/onboarding/staff/service/policy foundations; Stage 3 retains full marketplace/favorites/uploads; Stage 4 scheduling/appointments/resources/notifications; Stage 5 calendar/CRM; Stage 6 provider finance/POS; later stages remain as roadmapped.

**Future multi-service boundary (not an active booking engine):** `Booking` is the organization/location/customer appointment aggregate; `BookingItem` references a stable Service/optional Variant/eligible Employee and captures immutable name, integer price, duration, preparation/cleanup and sequence snapshots. Aggregate totals/duration derive from its items. Explicit policy acceptance records the version and terms snapshot. Availability, overlap protection, resource allocation, rescheduling and state transitions must go through one later booking engine, never UI writes to these snapshots.

**Future payment sequence (inactive):** authenticated customer → authorized business/services → provider-hosted SetupIntent/equivalent with future/off-session mandate and any SCA → verified provider webhook → opaque customer/payment-method references → explicit policy version acceptance → booking confirmation → idempotent completion/authorized cancellation/no-show charge. A provider adapter owns setup authorization and charging. Charge failures, SCA reauthentication, refunds, webhook signatures/retries and legal authorization must be designed/tested before activation. No real provider, raw card storage, card-entry field or fee collection exists now; no claim of legal enforceability.

Store UTC instants with location IANA zones; calendar-only dates as strings/date columns. Scheduling must account for Berlin DST and enforce exclusive overlap transactionally in PostgreSQL. Cancellation/edit/AI actions must all call the same booking engine. Financial values use integer cents and financial/stock mutations need idempotency.

Uploads will use approved persistent object storage, with only metadata in PostgreSQL, safe upload validation and scoped download authorization. Messages/payments remain explicit development simulations until authorized. No production compliance, backup recovery or paid integration is assumed.
