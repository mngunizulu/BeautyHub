# Test report

## Stage 2 incremental verification
- Managed authentication provisioning succeeded; no credentials were printed.
- Additive migration applied without a database reset. Original 3 synthetic businesses / 9 services were explicitly verified.
- Full workspace `pnpm run typecheck` and `pnpm lint` passed.
- `LOG_LEVEL=silent pnpm test`: **53/53 passed** across 4 files (27 retained Stage 1 tests with updated auth/stage fixtures; 22 Stage 2 real-PostgreSQL API tests, one inactive-membership unit regression and three independent-panel data-preservation regressions).
- New coverage: stable returning identities, profile/preferences, no self-admin, atomic owner setup, drafts/resume, structured Essen address/hours, multiple organizations, tenant denial, service groups/variants/stable identifiers, public prices/soft archive, policy defaults/versioning, hashed expiring invitations, wrong-recipient rejection, concurrent single-use acceptance, role/deactivation/audit and user-scoped payment references/export/deletion requests.
- The external Clerk boundary alone is mocked in API integration tests. This does not establish provider registration/recovery browser success.
- Both managed app workflows restarted cleanly. Actual sign-in component screenshot rendered; only standard development-provider/browser warnings observed.
- **Actual browser journey executed:** managed signup component; new managed-provider test consumer signed in using the supported Clerk helper; profile/phone persistence across reload; six-step organization setup; Essen address; policy v2 (48h/50% late/100% no-show); employee/hours; service group and assigned €65/50min service; controlled publication; logout/protected redirect; public Essen discovery, correct price/address/hours, no demo badge; original demo preservation and 390×844 no-overflow check.
- **Original browser verdict: failure despite completing the path.** Saving booking settings from an already mounted panel overwrote hours saved by the neighboring panel. Tester restored hours to finish discovery; this workaround is not counted as a clean pass.
- **Fix confirmed:** partial panels merge only their owned fields into the latest workspace location instead of sending stale hidden fields. Three dedicated unit regressions passed. The same browser then verified Mon 10–19 hours survived saving lead 5h/advance 61 days without reload, the reverse hours save preserved those settings, and a reload preserved both. **Focused browser verdict: success.** No second full journey was launched.
- The tester unpublished only its own test business through the owner UI and logged out. Account and private fixture rows were retained; no existing user data was deleted.
- Frontend build passed with the managed service's non-secret `PORT=24812 BASE_PATH=/` inputs. Non-blocking source-map warnings from two existing UI scaffolds and a >500kB bundle warning remain; no production release is claimed.
- Final strengthened cross-tenant service update/archive assertions passed in the 42-test API recheck; the other 11 tests remained unchanged from the successful 53-test full run.
- Final API/web workflows restarted cleanly; live health returned connected, guest `/api/me` returned 401, and the public summary returned the preserved 3 businesses / 9 services / 9 categories after browser-fixture unpublication.
- Managed sign-up/sign-in identity integration was exercised programmatically; CAPTCHA/interactive provider signup and a real email-inbox recovery roundtrip were not exercised. Recovery remains provided by the managed sign-in component. No recovery email, invitation email, real card setup or payment was sent/processed.
- Repository Playwright smoke cases were updated for enabled managed auth and non-fixed public counts; the Playwright command itself has not been run. The browser evidence above comes from the actual managed-auth browser runner, not test discovery.

Only actual executed checks count as passed. Stage 1 uses unit tests and API integration against the real development PostgreSQL database, with uniquely identified temporary fixtures cleaned after the run.

## Initial results
- `pnpm --filter @workspace/api-spec run codegen` — **PASS**, generated hooks and validators and library typecheck.
- `pnpm --filter @workspace/db run generate` — **PASS**, initial migration for seven tables generated.
- `NODE_ENV=development pnpm --filter @workspace/db run migrate:dev` — **PASS**, migration applied to development only.
- `NODE_ENV=development pnpm --filter @workspace/db run seed:dev` — **PASS**, three synthetic salons, nine categories, nine services; no real accounts.
- `pnpm run typecheck` — **PASS**, initial complete workspace strict check.
- `pnpm test` — **INITIAL FAILURE: 26 passed, 1 failed.** Express's simple query parser treated `q[a]` as an unknown literal key; the generated non-strict schema stripped it, returning 200 instead of expected 400. Fixed by strict query-object validation, not by weakening the test. Final rerun below.

## Final results
- `LOG_LEVEL=silent pnpm test` — **PASS: 27/27** (7 policy unit tests, 20 real-DB API integration tests; 2 test files). The suite also verifies summary service counts against an independent SQL count.
- `pnpm lint` — **PASS**, zero warnings/errors across API, database and application source; generated component-library primitives excluded. Expanded frontend lint initially found the starter toast hook's type-only constant; the unused constant was renamed consistently and lint reran successfully.
- `pnpm run typecheck` — **PASS**, strict library and all application/script checks, after all source changes.
- `NODE_ENV=development pnpm --filter @workspace/db run seed:dev` — **PASS on repeat**, confirming idempotent synthetic data initialization.
- `pnpm exec playwright test --list` — **PASS**, six smoke cases discovered across desktop/mobile Chromium projects. **This did not run browser interactions.**
- Managed API workflow restart — **PASS**, esbuild completed and listener started; frontend workflow restart — **PASS**, Vite serving through Preview.
- Proxy HTTP checks — **PASS**: `/api/healthz` 200 with connected database; `/api/marketplace/summary` returned 3 businesses/9 categories/9 services; `/api/businesses/atelier-haar` returned 3 services and 6 opening-hour rows; `/api/admin/workspace` returned 401.
- Preview screenshots — **PASS for rendered views**: desktop homepage at 1440×1050 and mobile profile at 390×844. Browser capture logs showed no application runtime errors. Screenshots do not verify typing/menu/filter interactions.

## Additional defect found during Preview verification
The homepage initially showed zero total services despite correct individual salon catalogs. Inspection of generated SQL showed Drizzle's single-table select removed the qualifier on an interpolated outer ID inside a raw subquery; PostgreSQL bound it to the inner service ID instead. Replaced the nested aggregate with an explicit services/locations join, added an independent SQL-count regression assertion, reran the 27 tests, restarted the API and confirmed the actual response and homepage show 9 services. No test was weakened.

## Checkpoint evidence
No manually addressable Replit checkpoint identifier or creation tool was exposed. The Git CLI reported that this environment is not a Git repository. No commit/checkpoint is fabricated; recovery state, source, migration SQL and all executed-check results are persisted.

## Coverage intent and limits
Unit policy cases cover anonymous, cross-tenant, multi-membership, role-restricted and administrator boundaries. API integration checks exercise DB readiness including controlled failure, real persistence, public-only projections/visibility, name/service/city/category filtering, literal SQL/wildcards, validation, 404/error safety, category/summary counts, guest/forged-header denial, security headers and database constraints.

**NOT RUN:** Playwright browser interaction suite on initial build. Browser smoke tooling/spec is provided; screenshots are visual checks, not proof that interactions passed. No signed-in UI exists yet; real authentication/onboarding, authenticated tenant read/write isolation, booking/DST/concurrency, payments, inventory, security audit, performance/load and legal/fiscal compliance are not claimed or verified in Stage 1. These are assigned to their corresponding later roadmap stages.

## 2026-11-21 — Local handoff

- Baseline Windows test startup failed because native packages were excluded by workspace overrides. Restored Windows x64 packages and regenerated the lockfile.
- API code generation, strict typecheck, lint and workspace production build passed. The frontend build emitted sourcemap and bundle size warnings.
- Development migrations and fictional seed succeeded against isolated PostgreSQL 17. Vitest passed 55/55 tests across four files, including combined public service/price filters and malformed prices. The auth tests used fixture credentials and the existing Stage 2 identity mock.
- Docker Compose built the images, migrated PostgreSQL, and passed same-origin HTTP smoke checks for database readiness, seeded catalog totals, combined service/price search, SPA navigation fallback and JavaScript asset delivery.
- Playwright and live Clerk authentication were not run during this handoff.

### Marketplace variants and release packaging

- All 55 tests passed against an isolated PostgreSQL 17 database after explicit migrations and development seed. The public-profile integration test checked the active variant fields and archived-variant exclusion.
- API code generation, strict typecheck and ESLint passed. Production-oriented Compose validated and built both application images. Local runtime smoke checked both services, PostgreSQL readiness, catalog and variant response, SPA fallback and catalog persistence across an API/web restart.
- Browser interaction, live Clerk, public TLS and live production database operations were not exercised.

### 2026-11-22 — Variant search

- PostgreSQL 17 migrations and development seed succeeded. All 56 tests passed, including variant search, exact price cutoffs and archive exclusion. API contract generation, typecheck and lint passed. Browser tests were not run for this change.

### Public staff profiles

- PostgreSQL 17 migrations and development seed succeeded. All 57 tests passed, including public-name opt-in, private-field exclusion, tenant denial, deactivation and clearing a public name. Strict typecheck, lint and production build passed. Browser interaction was not run.

### Marketplace galleries and favorites

- Applied migration 0004 on PostgreSQL 17. All 59 tests passed, including gallery validation, byte persistence, tenant isolation, unpublishing/removal, favorite ownership, visibility and concurrent duplicate saves. Strict typecheck, lint and production build passed.
- Signed-in browser journeys and responsive Stage 3 acceptance remain unverified. Clerk development credentials are not configured in the test environment.

### Stage 3 browser acceptance

- Installed Playwright Chromium and built, migrated and seeded an isolated Docker Compose stack. Four public browser tests passed across desktop Chromium and Pixel 7 emulation, including query persistence, profile navigation, no horizontal overflow, empty results and reset.
- The signed-in owner/customer scenario was discovered in both projects and skipped because a Clerk development instance and test session files were unavailable. Live sign-in and the signed-in workflow remain unverified. See BROWSER_ACCEPTANCE.md.

### Signed-in Stage 3 acceptance and Stage 4 quotes

- Browser acceptance passed with configured Clerk development credentials on the isolated Docker stack. Six public/guest and two owner/customer tests passed across desktop Chromium and Pixel 7. The signed-in test covered gallery upload, preview, public image decoding, saving a salon, account persistence and removal. A mobile grid overflow that intercepted clicks was fixed and regression-tested.
- Two temporary Clerk accounts used official test tokens. Test accounts and saved browser state were removed after the run. Interactive email/SMS verification and account recovery were outside the test.
- PostgreSQL 17 migration and seed succeeded. All 60 unit/API tests passed including the new quote pricing, variant visibility, tenant location scope and timing/buffer test. API generation, typecheck and lint passed.

### Stage 4 booking acceptance

- PostgreSQL 17 migrations through 0007 succeeded. All 65 unit/API tests passed, including DST spring/fall rules, quote and policy validation, simulated-payment ownership, buffered duration, employee/resource exclusion constraints, concurrent contention and idempotency, waitlist notices, and synchronized customer and business booking records.
- Production workspace build, strict typecheck, lint and OpenAPI generation passed. Docker built and ran the migrated stack with configured Clerk development authentication.
- Two Stage 4 Playwright scenarios passed, covering the same end-to-end flow on desktop Chromium and Pixel 7 emulation. The journey begins in availability-filtered search and includes simulated payment setup, policy consent, confirmation, calendar verification, rescheduling and cancellation. Six public/guest browser regressions also passed.

### Stage 5 manual and walk-in calendar appointments

- Applied migration 0008 on a disposable PostgreSQL 17 instance. All 66 tests passed, including tenant-scoped creation, idempotent replay, walk-in date constraints, business calendar visibility and manual reservations blocking public availability.
- API generation, type checking, lint and workspace production build passed. Browser tests were not run for this increment. The user-facing local preview remained stopped.

### Stage 5 calendar, staff and private CRM acceptance

- Applied PostgreSQL 17 migrations through 0010. All 66 unit/API tests passed. Coverage includes calendar changes in customer views, stale move rejection, staff break booking conflicts, tenant isolation, CRM revision checks, visit segmentation and private PDF access.
- Ran two isolated Clerk Playwright operations journeys on desktop Chromium and Pixel 7. The journeys exercised drag/drop or the accessible move form, weekly breaks, creating a private customer, linking appointment history and uploading a document. API generation, type checking, the production build and lint passed.

## Stage 5.5 professional pricing — 2026-11-22

All 67 tests passed against PostgreSQL 17 through migration 0011. The added API coverage exercised tenant isolation, variant prices and durations, default fallback, automatic assignment, quote validation and historical prices after override changes.
Signed-in desktop and mobile Chromium journeys passed with the configured Clerk development instance. Both checked the named professional and the selected slot's EUR 77 total, then confirmed the booking, rescheduled it and checked that cancellation appeared on the business calendar.

## Stage 5.5 staff allocations and checkout summary

All 68 PostgreSQL-backed tests passed through migration 0012. The mixed-professional regression checks ordered staff intervals, quote assignment validation, rejection of an overlap on the second professional, rescheduling and cancellation.
Four signed-in Chromium journeys passed on the isolated Docker stack. Desktop and mobile each verified the checkout summary, booking, rescheduling and cancellation with one named professional and with two professionals assigned automatically.

## Stage 5.5 multi-service checkout

All 68 PostgreSQL-backed tests passed through migrations 0013 and 0014. API coverage verifies available and unavailable dates, note visibility for the booking owner, notice configuration and snapshot enforcement, and cancellation during the rescheduling cutoff. API generation, lint, type checking, and the production build passed. Browser acceptance for the new Task B controls remains pending.

## Stage 5.5 public profiles and calendar files

All 68 PostgreSQL-backed tests passed through migration 0015. Coverage includes owner profile edits and tenant permissions, public profile data, empty review state, review averages and ordering, exclusion of draft and cancelled-appointment reviews, and private calendar downloads through creation, rescheduling and cancellation. Browser acceptance for these controls remains pending.

## Stage 5.5 booking email and final acceptance

All 68 PostgreSQL-backed tests passed through migration 0016. The API test checks absence of email for a rejected booking, idempotent booking retries, delivery retry after failure, concurrent worker claims, and the three event snapshots. Lint, type checking, and production build passed.

Signed-in desktop and mobile Chromium passed the Essen marketplace and public profile flow, grouped four-service selection and variant, live availability calendar, named-professional pricing, notes, simulated payment, private calendar download, reschedule, and cancellation. The isolated Docker capture volume contained all six emails across the two bookings. Each sequence used the same calendar UID, included the booked variant and EUR 97 total, and marked cancellation appropriately. The live HTTPS gateway remains unconfigured.

## Stage 6 appointment payment records

All 68 PostgreSQL-backed tests passed through migration 0017. Coverage includes tenant isolation, rejection of fractional cents, concurrent overpayment prevention, idempotent replay, and settlement of the exact remaining balance. Signed-in desktop and mobile Chromium recorded one EUR 20 simulated card deposit each and showed EUR 57 outstanding. Both deposits were verified in PostgreSQL.

## Stage 6 appointment refunds and receipts

All 68 PostgreSQL-backed tests passed through migration 0018. Coverage includes private receipt authorization, refund idempotency, concurrent over-refund prevention, and preservation of the settled balance. Desktop and mobile signed-in Chromium each recorded a EUR 20 simulated deposit, cancelled the appointment, recorded a EUR 8.50 refund, and downloaded the receipt showing the refund. Both refunds were verified in PostgreSQL. Lint, type checking, API generation, and the production build passed.

## Stage 6 daily appointment reconciliation

All 68 PostgreSQL-backed tests passed. The daily report tests cover tenant access, invalid dates, pagination, and separating a payment and refund across the Berlin daylight-saving midnight boundary. Signed-in desktop and mobile Chromium showed each deposit and refund in the daily report and verified the counted-cash difference. PostgreSQL held EUR 40.00 in payments and EUR 17.00 in refunds across the two test bookings. API generation, lint, type checking, and the production build passed.

## Stage 6 appointment checkout discounts

All 68 PostgreSQL-backed tests passed through migration 0019. Coverage includes discount reason and amount validation, concurrent request replay, the adjusted settlement and balance, refund limits based on actual payment, and separate receipt and daily discount amounts. API generation, lint, type checking, and the production build passed. A signed-in browser test of the discount controls remains pending.

## Stage 6 retail checkout

All 69 PostgreSQL-backed tests passed through migration 0020. Coverage includes tenant isolation, integer-cent and quantity multiplication, concurrent replay, receipt authorization, and retail movements in daily reconciliation. Signed-in desktop and mobile Chromium each recorded a EUR 25 cash retail sale, found the sale in the daily history, and downloaded its receipt. PostgreSQL confirmed both sales. API generation, lint, type checking, and the production build passed.

## Stage 6 retail refunds

All 69 PostgreSQL-backed tests passed through migration 0021. Tests cover partial and full retail refunds, tenant access, concurrent refund caps, idempotent retries, receipt updates, and refund-day reporting. Signed-in desktop and mobile Chromium each recorded EUR 7.50 against a separate EUR 25.00 sale, found it in the daily report, and downloaded the updated receipt. PostgreSQL confirmed both refunds. API generation, lint, type checking, and production build passed.

## Stage 6 vouchers and customer payment history

All 69 PostgreSQL-backed tests passed through migration 0022. API coverage includes tenant access, voucher preview, rollback after invalid checkout, competing voucher redemptions, idempotent replay, and appointment settlement. The customer history test verifies owner-only access and exclusion of internal refund reasons and staff IDs. Signed-in desktop and mobile Chromium each issued a EUR 5 voucher, applied it to a EUR 25 retail sale, and downloaded the updated receipt. PostgreSQL confirmed both redemptions and EUR 40 received. API generation, lint, type checking, and the production build passed.
Signed-in desktop and mobile also verified that the customer sees a EUR 20 appointment deposit and a subsequent EUR 8.50 refund in their account history.

## Stage 7 location inventory foundation

All 70 PostgreSQL-backed tests passed through migration 0023. Coverage includes tenant and location access, normalized SKU uniqueness, image URL validation, idempotent receipts, concurrent corrections, archived history, and prevention of negative stock. Signed-in desktop and mobile Chromium each created an item, recorded a five-unit receipt, checked movement history, and verified that the low-stock warning cleared. Both balances were confirmed in PostgreSQL. API generation, lint, type checking, and the production build passed.

## Stage 7 suppliers and purchase orders

All 70 PostgreSQL-backed tests passed through migration 0024. Coverage includes tenant authorization, supplier edits, order creation replay, atomic rollback when a line becomes unavailable, concurrent receipt retries, and rejection of cancellation after receipt. Signed-in desktop and mobile Chromium created a supplier and purchase order, received three units, and saw the open movement history refresh to stock eight. Both completed orders were confirmed in PostgreSQL. API generation, lint, type checking, and the production build passed.

## Stage 7 retail stock integration

All 70 PostgreSQL-backed tests passed through migration 0025. Coverage includes server-owned catalog prices, concurrent oversell protection, request replay, and preservation of stock after a financial refund. Signed-in desktop and mobile Chromium each sold two units from a five-unit balance, found the retail sale in daily history, downloaded a receipt, and verified a stock movement and balance of three. Both sale-to-stock links were confirmed in PostgreSQL. API generation, lint, type checking, and production build passed.

## Stage 7 partial deliveries

All 70 PostgreSQL-backed tests passed through migration 0026. Coverage includes per-line received quantities, duplicate receipt retries, over-receipt rejection, and full receipt of the remaining items. Signed-in desktop and mobile Chromium each received one unit of a three-unit order, saw the order stay open, then received the remaining two. Both movements and final stock of eight were confirmed in PostgreSQL. API generation, lint, type checking, and the production build passed.

## Stage 7 purchase costs and inventory report

All 70 PostgreSQL-backed tests passed through migration 0027. Tests verify purchase-cost validation, optional legacy values, and preservation of order cost snapshots after catalog edits. Signed-in desktop and mobile Chromium verified EUR 22.50 after a five-unit receipt and EUR 45.00 after a second priced item at the same location. PostgreSQL confirmed both item balances and total value. API generation, lint, type checking, and the production build passed.

## Stage 8 campaign drafts and consent

All 70 PostgreSQL-backed tests passed through migration 0028. Coverage verifies default-off business consent, tenant-scoped draft access, aggregate-only audiences, completed and repeat eligibility, and withdrawal. Signed-in desktop and mobile Chromium saved a campaign draft, verified an empty opted-in audience, and reopened the saved draft. PostgreSQL confirmed both drafts. API generation, lint, type checking, and the production build passed.

## Stage 8 local campaign capture

All 70 PostgreSQL-backed tests passed through migration 0029. Coverage verifies capture access, duplicate retry handling, recipient and message snapshots, the account preference link, and exclusion after consent withdrawal. Signed-in desktop and mobile Chromium each captured an empty eligible audience and showed the capture in history. API generation, lint, type checking, and the production build passed.

## Stage 8 campaign templates

All 70 PostgreSQL-backed tests passed through migration 0030. API tests verify that templates stay within the business and can be updated independently of drafts. Signed-in desktop and mobile Chromium each saved and reloaded a template, revised it, and used it to create a separate draft. The original draft retained its subject. API generation, lint, type checking, and the production build passed.

## Stage 8 customer reviews

All 70 PostgreSQL-backed tests passed. Coverage verifies ownership, rejection of cancelled appointments and invalid ratings, one successful submission under concurrent requests, the saved account rating, and the resulting public review and average.

## Stage 8 business review replies

All 70 PostgreSQL-backed tests passed. Coverage verifies that only the reviewed business can reply, unpublished reviews are excluded, staff receive no customer identifiers, and saved and cleared replies are reflected through the review API. See the Stage 8 signed-in review acceptance results below.

## Stage 8 review reporting

All 70 PostgreSQL-backed tests passed through migration 0031. Coverage verifies authentication, reason validation, rejection of unpublished reviews, duplicate reports submitted concurrently, private storage, and continued public visibility. API generation, lint, type checking, and the production build passed. See the Stage 8 signed-in review acceptance results below.

## Stage 8 review moderation

All 70 PostgreSQL-backed tests passed through migration 0032. Coverage verifies guest and business-owner denial, platform administrator access, the private queue, review hiding and restoration, report dismissal, and audit records. See the Stage 8 signed-in review acceptance results below.

## Stage 8 signed-in review acceptance

Desktop and mobile Chromium passed against a fresh isolated Compose stack through migration 0032 and the Clerk development instance. Each run published a review from a completed fixture appointment, saved a public business reply, submitted a private report, and hid and restored the review as a platform administrator. PostgreSQL confirmed two resolved reports, two restored reviews, and corresponding hide and restore audit events. The test reset the temporary administrator flag.

## Stage 8 loyalty earning

All 70 PostgreSQL-backed tests passed through migration 0033. Coverage verifies tenant permissions, default-off and paused programs, exclusion of guest appointments and no-shows, concurrent completion retries, and unchanged past awards after a rate change. Signed-in desktop and mobile Chromium passed with loyalty enabled. The customer balance increased by eight points after each completion. API generation, lint, type checking, and the production build passed.

## Stage 8 retention completion

All 70 PostgreSQL-backed tests passed through migration 0037. Coverage includes concurrent loyalty exchanges, account-bound voucher redemption, transferable gift issuance and single-use checkout, idempotent package purchases, concurrent spending of the final visit, fixed-term membership renewal, reminder rescheduling, and follow-up suppression after consent withdrawal. API generation, lint, type checking, and the production build passed.

Signed-in desktop and mobile Chromium each verified the points exchange, simulated service-package purchase, fixed-term membership enrollment, gift-code issuance, and the review and moderation flow. Each browser ran against its own synthetic tenant. The temporary test stack was removed.

## Stage 9 business analytics

All 70 PostgreSQL-backed tests passed. Analytics coverage reconciles booking counts, payment and refund totals, staff attribution on shared bookings, current stock valuation, and captured marketing counts with source records. It also verifies tenant denial, foreign-location denial, and payment and refund attribution across midnight in the location’s time zone. Signed-in desktop and mobile Chromium verified date and location filtering and the reported cancellation from the booking flow. API generation, lint, type checking, and the production build passed.

## Stage 9 business SaaS subscriptions

All 71 PostgreSQL-backed tests passed through migration 0038. Tests cover trial expiry, tenant and role boundaries, platform plan edits, stale quotes, duplicate billing requests, plan upgrades and downgrades, cancellation, and concurrent location creation at the plan limit. Signed-in desktop and mobile Chromium verified plan activation, switching, cancellation, and the history shown to the business owner. PostgreSQL recorded four simulated activations and two cancellations. API generation, lint, type checking, and the production build passed.

## Stage 9 platform business administration

All 71 PostgreSQL-backed tests passed through migration 0039. Coverage verifies platform authorization, one audit event for concurrent duplicate suspension, public profile and booking suppression, continued workspace access, and restoration with verification intact. Signed-in desktop and mobile Chromium verified the directory, public verification indicator, suspension, reactivation, and removal of verification. PostgreSQL showed an audit entry for each of the four actions in both completed runs. API generation, lint, type checking, and the production build passed.

## Stage 9 platform customer accounts

All 72 PostgreSQL-backed tests passed through migration 0040. Coverage verifies platform-only access, a limited customer response, active business ownership counts, stale-request rejection, and a single review record under concurrent requests. Signed-in desktop and mobile Chromium verified the queue, customer search, review acknowledgment, and continued access to the customer account and request. PostgreSQL confirmed two review records linked to their original requests. API generation, lint, type checking, and the production build passed.

## Stage 9 support cases

All 73 PostgreSQL-backed tests passed through migration 0041. Tests cover customer isolation, platform authorization, concurrent submission retries, closure, and reopening. Signed-in desktop and mobile Chromium each opened a case, posted an administrator reply, closed the case, and confirmed the customer could still read the conversation. PostgreSQL confirmed both cases, replies, and closure events. API generation, lint, type checking, and the production build passed.

## Stage 9 platform overview and settings

All 74 PostgreSQL-backed tests passed through migration 0042. Coverage verifies platform-only access, aggregate reconciliation, rejection of stale settings, one audit record for concurrent duplicate settings changes, and that pausing intake blocks new registrations and cases while preserving existing conversations. Signed-in desktop and mobile Chromium verified the dashboard and paused and resumed support intake. PostgreSQL confirmed four changes and both controls restored to enabled. API generation, lint, type checking, and the production build passed.

## Stage 9 detailed business reporting

All 74 PostgreSQL-backed tests passed. The tests reconcile the service and staff breakdowns to the recorded payments and refunds and verify first-visit and returning-customer classification. Signed-in desktop and mobile Chromium verified that the new report sections render with the date and location filters. API generation, lint, type checking, and the production build passed.

## Stage 9 capacity utilization

All 74 PostgreSQL-backed tests passed. Tests verify that overlapping breaks and booking blocks subtract time once, confirmed appointments count within staff capacity, and completed appointments continue to count after their active reservations are released. Signed-in desktop and mobile Chromium verified 540 scheduled minutes and zero occupied minutes after cancellation. API generation, lint, type checking, and the production build passed.

## Stage 10 account export and recovery rehearsal

All 74 PostgreSQL-backed tests passed. Coverage checks export ownership and field exclusions for bookings, payment references, refunds and support messages. API tests also verify a controlled 403 response for an unsupported write origin. Signed-in desktop and mobile Chromium downloaded and parsed the JSON export and verified the fixture booking in the result. A PostgreSQL 17 dump restored into an independent test database with matching migration records, fixture counts and exclusion constraints. API generation, lint, type checking, and the production build passed.

## Stage 10 deletion-request safeguards

All 74 PostgreSQL-backed tests passed. Tests cover protected assessment counts, duplicate withdrawals, preservation of review acknowledgments, and stale review and withdrawal requests against a newer request. Signed-in desktop and mobile Chromium verified assessment, review and withdrawal. PostgreSQL confirmed two acknowledgments remained after withdrawal. API generation, lint, type checking, and the production build passed.

## Stage 10 synthetic account erasure

All 75 PostgreSQL-backed tests passed. The erasure regression checks administrator authorization, disabled and live-key modes, review and timestamp requirements, rollback for retained payment references, deletion of account-linked support data, and prevention of local account reprovisioning. Signed-in desktop and mobile Chromium verified that an administrator could confirm an erasure attempt and that an existing booking blocked it. The customer could still withdraw the request. API generation, lint, type checking, and the build passed.

## Stage 10 route loading

The first-party JavaScript entry fell from 244.50 kB to 180.48 kB gzipped in comparable local production builds. A desktop Chromium request trace confirmed that the home page deferred salon discovery, salon detail, account, workspace and platform customer chunks. Opening salon discovery fetched its chunk. Six public Playwright checks and two signed-in booking and administrator review journeys passed across desktop and mobile Chromium. The gallery and favorites checks were skipped because their fixture credentials were absent from the public run. Lint, type checking and the build passed.


## Stage 10 keyboard navigation

Eight public Playwright checks and two signed-in booking journeys passed on desktop and mobile Chromium. Coverage includes native keyboard focus on the main landmark and the booking section, current-page semantics in both navigation layouts, and opening the mobile disclosure with Enter and dismissing it with Escape. Dismissal returns focus to the menu button. Lint, type checking and the application Docker build passed. Screen-reader testing and a broader accessibility review remain open.

## Stage 10 booking calendar accessibility

Signed-in desktop and mobile Chromium passed the grouped-service booking scenario. Both runs clear the native date field, change the service selection, confirm the calendar still loads, select a date with Enter, check that focus stays on the pressed date, and verify the availability announcement. The journey also covers booking, rescheduling and cancellation. Lint, type checking and the Docker web build passed. Browser assertions verify live-region content. Manual screen-reader testing remains open.

## Stage 10 appointment management accessibility

Signed-in desktop and mobile Chromium verified the customer appointment flow. Enter opens rescheduling and focuses the date field. Escape closes the form and returns focus to Umbuchen. Search results and a successful reschedule update the status region. Cancellation moves focus to the updated appointment, and the business calendar reflects the cancellation. Lint, type checking and the Docker application build passed. Manual screen-reader testing remains open.


## Stage 10 local release verification

All 75 PostgreSQL-backed tests passed after applying all 44 migrations to a fresh PostgreSQL 17 database. Lint, type checking and the full workspace build passed. The production dependency audit returned zero advisories. The production Compose file parsed with placeholders.

All 14 browser cases passed across desktop and mobile Chromium in two batches. The first batch passed 12 cases covering navigation, booking, rescheduling, cancellation, administrator request review, gallery uploads and favorites. Business operations reached the API rate limit when run last from the shared local IP. Both operations cases passed in a separate batch with fresh fixtures and the existing rate limit.

With API writes stopped, a custom-format PostgreSQL 17 dump restored into a separate local database. The source and restore each contained 44 migrations, 7 locations, 25 services, 4 bookings, no erasure markers and 2 exclusion constraints. Production host verification, manual screen-reader testing, live data retention and processor handling remain launch gates.


## Local first platform administrator

Migration 0044 applied to the existing local stack. The sole verified local identity matched the existing Clerk Development identity and its verified primary address. Browser verification used a short-lived sign-in ticket for that identity. Before the grant the signed-in account received HTTP 403 on platform analytics. The bootstrap granted one role and wrote one audit event. Repeating it left one administrator and one audit event, and an unknown ID was rejected. Chromium rendered the platform dashboard and business metrics for the same authenticated identity. Analytics and platform settings returned HTTP 200. Both temporary verification sessions were revoked.

All 76 PostgreSQL-backed tests passed on a fresh disposable database. The added regression verifies HTTP 401 for guests and HTTP 403 for both a dedicated consumer with no business memberships and a business owner on analytics, customer administration and platform settings. It also verifies HTTP 403 on settings writes by both signed-in roles. Lint and type checking passed. Production configuration and deployment were outside this work.

## Render Free preview image

The single-service image built from Dockerfile.render and ran locally against disposable PostgreSQL 17 with Clerk Development configuration. Checks covered HTTP 200 for health, the salon SPA, its built script and the demo catalog. Guest administrator access returned 401. Missing API routes and assets returned 404. A restart preserved all 45 migrations and the three fictional salons. Lint and type checking passed. The Render-hosted service has yet to be deployed and verified.

## Marketplace category registration

Migration 0045 adds ten marketplace categories without loading demo salons. A clean PostgreSQL database had ten categories and zero locations before seeding. A separate legacy fixture verified that existing Spa and Hautpflege locations retain valid category assignments after consolidation. All 77 PostgreSQL-backed tests passed, including multi-category onboarding, filtering, counts, validation and editing. Signed-in desktop and mobile Chromium registered a fictional business with two categories and verified both were retained in its profile. Lint, type checking and the Docker build passed.

## Business gallery and image assignments

Migration 0046 adds optional cover, service and inventory photo assignments. Galleries accept up to ten new uploads per location, with size and dimension limits validated by the server. All 77 PostgreSQL-backed tests passed. The gallery regression covers upload rejection, authorization, the concurrent ten-photo limit, assignment projections, publication boundaries and automatic clearing on deletion. Signed-in desktop and mobile Chromium verified the Gallery navigation, assigning one uploaded 1280 × 720 image to a cover, service and product, then rendering it on the public card and profile, the public service and the private inventory row. Lint, type checking, API generation and the Docker application build passed.

## Homepage gallery and online booking start controls

Migration 0047 adds platform homepage image storage and service-specific hidden starts. All 78 PostgreSQL-backed tests passed. Coverage verifies administrator-only image management, public access only after placement, cleanup on deletion, tenant access checks for start switches, repeatable updates and server rejection of a booking at a hidden start.

Signed-in desktop and mobile Chromium both verified that picking a date loads available times automatically, a business can hide and restore a start in booking settings, and a platform administrator can publish an image for the homepage hero and the Friseure tile. A guest browser verified both published placements. Lint, type checking and the Docker application build passed.
