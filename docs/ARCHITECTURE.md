# Architecture

## Modular monolith
One product with React frontend and one Express API, independently built packages but no microservice domain split. The Docker stack serves frontend `/` and backend `/api` on the same origin. All browser API requests are relative, typed and generated from OpenAPI. Future consumer/business/admin areas share this API and its domain services.

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

Migrations are checked into `lib/db/drizzle/`. Run development migration generation/application explicitly; never DDL on API startup. Seed is development-only, transactional and idempotent, using stable synthetic IDs. No actual users or admin accounts are seeded. Production schema changes use the separate migration procedure in DEPLOYMENT_DOCKER.md.

## Authentication boundary
Managed Clerk was provisioned for Stage 2 and owns registration, sign-in, verification, recovery and sessions. Backend Clerk middleware verifies provider identity; a unique external-ID bridge prevents duplicate internal users. Returning profile/session requests refresh provider-owned email verification without overriding the user's local display name/preferences. Browser APIs use managed same-origin cookies, never caller identity headers or custom local JWTs.

Verified provider identity → internal user → active DB membership → route role/organization/nested-ID checks. Platform administrator assignment has no public/self-service endpoint: a trusted operator must explicitly assign it separately. Admin status alone does not grant salon-private access. Same-origin/Fetch-Metadata checks reject cross-site mutations; private responses are no-store. Authenticated IDOR/role/revocation tests use the real DB with only the external Clerk boundary mocked.

## API contract
`lib/api-spec/openapi.yaml` is the source of truth; run codegen after edits. Routes:

| GET path (under `/api`) | Semantics |
|---|---|
| `/healthz` | Real database probe, 200 connected or 503 degraded; timestamp/version |
| `/categories` | Category names and actual published-business counts |
| `/businesses?q=&city=&category=&service=&maxPriceCents=` | All filters ANDed; literal case-insensitive name/description/service and city search, category exact, service or variant name and maximum price must match the same published offering; capped at 100 |
| `/businesses/{slug}` | Published-only profile, published services with active variants, opt-in public staff names, and opening hours, or 404 |
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
Stage 2 implements identity/onboarding/staff/service/policy foundations; Stage 3 implements marketplace search, opt-in public staff, gallery uploads and account favorites; Stage 4 scheduling/appointments/resources/notifications; Stage 5 calendar/CRM; Stage 6 provider finance/POS; later stages remain as roadmapped.

The read-only booking quote resolves selected services and variants at a single published location and returns the database price, duration and buffers from one consistent snapshot.

## Stage 4 booking architecture

Availability is evaluated against the location's IANA timezone, opening hours, the active staff member's work schedule, service eligibility, one-off blocks, buffered duration, existing reservations and the location's lead and advance limits. For a daylight-saving fold, distinct UTC instants remain distinct. Marketplace date search uses this same evaluation for qualifying services and variants. Each online booking currently schedules all selected services sequentially with one employee. Exclusive resources required by any line are held for the full visit.

The booking transaction locks the location, rechecks availability and price, validates the current policy and the customer's active simulated payment reference, and writes the appointment, immutable service snapshots and event together. The request key is unique per customer. PostgreSQL exclusion constraints independently enforce non-overlap for confirmed employee reservations and all resource holds. Cancellations and rescheduling change the same rows seen by the customer and business calendar. History captures state changes and estimated fees. The account waitlist shows an in-app notice when a booking change may alter availability.

Booking requires the development-only simulated reference and explicit policy consent. It captures no cards and makes no charges. Manual and walk-in operational views are scheduled for Stage 5. Payment collection and reconciliation are scheduled for Stage 6.

**Future payment sequence (inactive):** authenticated customer → authorized business/services → provider-hosted SetupIntent/equivalent with future/off-session mandate and any SCA → verified provider webhook → opaque customer/payment-method references → explicit policy version acceptance → booking confirmation → idempotent completion/authorized cancellation/no-show charge. A provider adapter owns setup authorization and charging. Charge failures, SCA reauthentication, refunds, webhook signatures/retries and legal authorization must be designed/tested before activation. The current simulation stores opaque references and records estimates for events. Real charges remain inactive.

Store UTC instants with location IANA zones; calendar-only dates as strings/date columns. Scheduling must account for Berlin DST and enforce exclusive overlap transactionally in PostgreSQL. Cancellation/edit/AI actions must all call the same booking engine. Financial values use integer cents and financial/stock mutations need idempotency.

Marketplace galleries currently use PostgreSQL for both metadata and bounded image bytes. This makes uploads atomic and portable on the existing Docker stack. Each location is capped at 12 photos of up to 768 KiB each. The API accepts JPEG, PNG and WebP with matching content type and structural signature checks. Image bytes are served without caching, with the same publication and tenant restrictions as metadata. Revisit object storage before expanding to larger or more numerous assets. Favorites use a user/location composite key and the public list hides unpublished locations. Messages/payments remain explicit development simulations until authorized. No production compliance, backup recovery or paid integration is assumed.

## Professional booking prices

A location can enable differential pricing for an exact professional, service and variant. Missing overrides fall back independently to the selected offering's standard price and duration. Prices use integer cents. Availability quotes account for the effective duration, and confirmation recomputes the selected slot before saving price and professional details on the booking lines. Later overrides leave stored booking prices intact. Automatic scheduling prefers a single eligible professional. When a time requires a handoff, each sequential service receives its own eligible professional and interval including buffers. Shared resources stay reserved for the whole visit. Migration 0012 backfills bookings and synchronizes staff intervals inside the booking transaction. A PostgreSQL exclusion constraint rejects overlapping staff intervals. Rescheduling reconstructs holds using the booked line durations and preserves prices. Cancellation releases each staff interval.

The weekly date lookup probes the shared availability engine for the entire selected offering set. Appointment notes are optional, trimmed, limited to 500 characters, and returned through authenticated booking and calendar views. Customer rescheduling enforces the notice period captured on the booking policy version. Older bookings without that field retain the zero-hour default.

Public review reads join published review records to completed appointments for a published location. The response omits customer identifiers and booking details. Contact and branding fields are managed by tenant owners or managers. Map links use stored coordinates or the stored address; an external map loads when the customer opens the link. Calendar downloads require the booking owner and use UTC times, a stable UID, and a sequence derived from booking lifecycle events.

Booking lifecycle writes add the event and notification snapshot in the same PostgreSQL transaction. An API worker polls committed rows with row locking and selects at most one row per delivery attempt. Transport failures update delivery state separately from the booking. Confirmation, reschedule and cancellation payloads use the accepted policy, the booked offerings, and the same calendar UID and sequence as the account download. Verified customer email is required for delivery. Guest appointments retain their lifecycle events.

Appointment POS records are append-only for current application operations. Each deposit or settlement stores integer EUR cents and a per-booking idempotency key. Writers lock the appointment before reading its ledger and validating the outstanding balance. Deposits require a confirmed appointment. Settlement requires a completed appointment and the exact remaining balance. Existing saved simulated payment references stay distinct from staff-recorded payments.

Appointment refunds are appended against a specific payment and inherit its original method. Refund writers use the same appointment lock as payment writers and cap the sum of refunds at the original payment amount. Refunds are allowed only after the appointment leaves confirmed status. Refunding a settled payment does not create a new balance to collect. Staff can download a private internal receipted record with the original payment and any subsequent refund entries.

The appointment reconciliation report uses half-open local-day bounds in the selected location timezone, applied to payment and refund recording timestamps. Refunds count on their own record day and use the original payment method. One SQL snapshot provides both full-day totals and a bounded transaction page. Cash comparison is calculated in the browser from counted net movement excluding the starting cash float.

A fixed appointment checkout discount is recorded with the settlement and requires a reason. The transaction validates the discounted balance under the existing booking lock. The booked price and previously recorded deposits stay intact. Receipt and daily reconciliation show the discount separately from the amount actually paid. Refunds are limited to the original payment amount.

Retail checkout calculates totals from immutable line snapshots containing a description, quantity, and integer-cent unit price. Each location uses a request key to deduplicate sales. Daily reconciliation uses the same location-day bounds for retail sales and appointment payments. The Stage 6 retail checkout uses manual lines. The product catalog and stock linkage are scheduled for Stage 7.

Retail refunds are appended against the original sale. Writers lock the sale, replay identical requests once, and cap the sum of reversals at the original amount. Refunds retain the original method and enter reconciliation on the refund day. An updated receipt shows the original sale, refund entries, and retained amount.

POS promotional vouchers are unique per business and can be redeemed once across retail and appointment settlements. An atomic update reserves the code inside the checkout transaction. Rejected checkout rolls back the reservation. Checkout replay checks the original code, and receipts and daily reconciliation keep the discount separate from received money. A positive payment must remain.

Inventory products are scoped to a location. Normalized SKUs are unique within that location, and archived products retain their history. Receipts and corrections append a signed quantity, resulting balance, actor and reason. Writers lock the product row and update its balance and movement in one transaction. Request keys prevent duplicate stock movements, and stock cannot go below zero.

Location purchase orders snapshot supplier and line labels. Receiving locks the order and its product rows, then advances every line and appends receipt movements in the same transaction. Retrying receipt returns the existing order. Cancelling an open order leaves stock unchanged. Partial receipts track received quantities per order line and use an order-scoped request key. The full-receipt action receives only the outstanding quantities. Cancelling a partially received order closes the remainder and preserves earlier stock receipts.

Retail checkout locks catalog products in a stable order, checks the current location price, and rejects quantities above stock. The committed sale stores the product ID, price, name and SKU snapshot. The sale and signed stock movement share a transaction. Cash or simulated-card refund entries affect the payment ledger. Staff record physical stock returns as explicit corrections.

Purchase costs are optional integer euro cents and are independent of retail prices. New purchase order lines snapshot the catalog cost at creation. The location report estimates the current stock value using current catalog costs and separately counts units without a recorded cost. Existing products and older order lines may lack a cost.

Business marketing consent is a separate customer-owned preference for each organization. A completed appointment with that business is required to opt in. Customers may withdraw consent even if their earlier appointment is no longer available. Audience previews expose counts only and require an explicit opt-in, verified email, an eligible completed-appointment segment, and an account without a pending deletion request. Campaign records at this milestone are drafts.

## Development campaign capture

Set `BEAUTYHUB_MARKETING_CAPTURE_APP_URL` to enable local campaign capture and set the account link base URL. Local Compose supplies a loopback URL. Capture takes a fresh snapshot of the saved draft and up to 1,000 currently eligible recipients in one transaction. Staff see capture metadata only. The captured copy includes a link to the signed-in account’s marketing preferences for that business. Capture has no outbound delivery.

## Stage 8 retention

A points exchange locks the customer record, spends 50 points once per request, and issues a 5 EUR voucher for that customer’s appointment checkout. Business-issued gift codes are transferable and single-use. A gift requires a checkout amount above the voucher value. Package and membership purchases are simulated. Fixed-term memberships renew manually after expiration. An eligible completed single-service booking with no recorded payment can consume one included visit. The checkout locks the booking and selected entitlement before recording coverage. Optional booking reminders and follow-ups run in local capture mode and recheck current preferences before delivery. Follow-ups also require consent for the business.
