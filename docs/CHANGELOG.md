# Changelog

## Stage 5.5 — Professional selection and differential pricing

- Added tenant controls for named and automatic professional assignment, public staff titles and photos, and service-variant price and duration overrides.
- Public and business bookings use exact slot quotes and store historical line item pricing. Price-filtered availability uses the actual professional quote.
- Added per-professional reservations for consecutive services within one appointment. The scheduler avoids overlaps for each professional, including in absences and break checks. The checkout shows a running service summary, itinerary and exact fee previews.

## Stage 2 — accounts and business onboarding
- Provisioned managed Clerk and connected verified internal identities, profiles/preferences, account export/deletion-request foundations and safe payment reference reads.
- Added versioned non-destructive migrations for organization onboarding, arbitrary structured German addresses, staff/schedules, service groups/variants/eligibility, policy versions and invitations/audits.
- Enforced active tenant membership, nested ownership, owner-only role/publication control, invitation hashing/expiry/recipient checks and atomic single use.
- Extended unit/real-PostgreSQL API regression coverage to 53 passing tests. The actual full browser journey completed, exposing a cross-panel hours overwrite; fixed it with regressions and passed a focused browser recheck in both save directions and after refresh.
- TypeScript, ESLint and frontend build passed. Test business was unpublished after browser verification; original public demos preserved. Managed inbox-recovery and later production lifecycle/legal/payment checks remain explicitly unverified.
- No production release, paid integration, card processing or booking engine activated.

## Stage 1 foundation — initial implementation
- Preserved the TypeScript/pnpm API starter and added the BeautyHub React frontend.
- Established OpenAPI-generated client/validators and real PostgreSQL-backed public development catalog.
- Added normalized identity/organization/membership foundations, published profile/service/hours schema, versioned development migration and explicitly fictional seed.
- Added live DB health, structured errors, secure headers, rate limiting, input validation, denied private namespaces and permission policies.
- Added German responsive routes, generated illustrative photography and explicit not-yet-enabled account/booking messaging.
- Added unit/API test tooling, strict checking, lint configuration and persistent product/architecture/roadmap/recovery/readiness documents.
- Verification outcome is maintained in TEST_REPORT; no production release or live integrations have been activated.
- Completed Stage 1 verification: 27 unit/API tests, strict checking and application/backend lint passed; desktop/mobile Preview rendered. Fixed strict search validation and a correlated-aggregate summary-count defect, with regression coverage. Configured six browser smoke cases; interaction runs remain NOT RUN.

## 2026-11-21 — Local handoff and marketplace search

- Added shareable service-name and maximum base-price filters with PostgreSQL integration coverage.
- Restored Windows x64 native packages for the existing toolchain.
- Added a local Docker stack with Nginx, Express, PostgreSQL and explicit development migrations.

## Marketplace variants and release packaging

- Show active variants on published salon profiles and exclude archived variants from the public response.
- Add a production-oriented Compose file for external PostgreSQL, a safe environment example and a Docker deployment and rollback runbook.

## 2026-11-22 — Variant search

- Search published service variants and apply the maximum price to the same matching offering.

### Public staff profiles

- Added an optional public display name for staff. Public salon profiles show only active employees with an explicit public name at that location.
- Fixed schema migration generation on Windows by using a relative Drizzle schema path.

### Marketplace galleries and favorites

- Added tenant-scoped per-location image upload, preview and removal, and public gallery rendering tied to publication.
- Added account-scoped favorites with save/remove actions on listing details and an account list.

### Stage 3 browser acceptance and Stage 4 start

- Verified the signed-in Stage 3 marketplace journey on desktop and mobile with Clerk development sessions. Fixed mobile workspace horizontal overflow and narrowed the auth smoke test to Clerk's form headings.
- Added a read-only booking quote for server-calculated prices, service durations and buffers across one or more services and variants.

### Stage 4 booking completion

- Added timezone-aware scheduling, availability-filtered search, multi-service booking and PostgreSQL conflict constraints.
- Added simulated payment setup and policy consent, customer booking history and appointment changes, waitlist alerts, and synchronized business calendars.

### Stage 5 begins

- Business owners and managers can create manual appointments and same-day walk-ins. Added booking-source labels and staff calendar filtering.
- Manual appointments use the shared reservation engine and private guest names with database-backed idempotency and overlap protection.

### Stage 5 calendar operations and private CRM

- Shared transactional rescheduling across calendar and customer flows, with drag-and-drop date selection and stale-view checks.
- Added recurring staff breaks, tenant-private CRM search and notes, contact preferences, tags and visit segmentation, appointment linking, and private PDF storage.

## Stage 5.5 - Multi-service checkout

- Added grouped service browsing, a weekly calendar with actual availability, and optional private appointment notes.
- Added a versioned, separately configurable notice period for customer online rescheduling.

## Stage 5.5 - Public profiles and calendar files

- Added public business phone, website, social link, logo, and a map link based on stored location information.
- Added sortable public reviews, aggregates, and business reply rendering.
- Added authenticated calendar downloads that reflect rescheduling and cancellation.

## Stage 5.5 - Booking notifications

- Added transactional confirmation, reschedule, and cancellation emails with HTML, plain text, and ICS content.
- Added local file capture, an opt-in HTTPS gateway, and durable delivery status and retry tracking.

## Stage 6 - Appointment payment records

- Added staff-recorded cash and simulated card deposits, settlements, and outstanding balances in the booking calendar.
- Added tenant-scoped payment APIs with idempotent retry and concurrent overpayment protection.

## Stage 6 - Appointment refunds and receipts

- Added partial and full refund records in the booking calendar, with concurrent over-refund and duplicate-request protection.
- Added private downloadable payment records that include related refunds.

## Stage 6 - Daily appointment reconciliation

- Added daily payment and refund history by location, with cash and simulated card totals and a counted-cash variance.
- Used the location timezone for the reporting day, including on daylight-saving transitions.

## Stage 6 - Appointment checkout discounts

- Added fixed discounts for completed appointment settlements, with an audit reason and an adjusted payment preview.
- Added discount amounts to the payment receipt and daily reconciliation report.

## Stage 6 - Retail checkout

- Added staff-recorded multi-line retail sales with cash and simulated card methods.
- Added private retail receipt downloads and included retail movements in daily reconciliation.

## Stage 6 - Retail refunds

- Added partial and full retail refund records with a required reason and safe retry behavior.
- Added retail refund entries to daily reconciliation and the original sale receipt.

## Stage 6 - POS vouchers and fiscal assessment

- Added staff issuance, checkout preview, and single-use redemption of fixed promotional vouchers.
- Documented the German POS production gaps for TSE, DSFinV-K export, receipts and related operations.

## Stage 7 - Location inventory foundation

- Added a location product catalog, SKUs, unit prices, supplier and category fields, and optional product images.
- Added stock receipts, corrections, movement history and low-stock status.

## Stage 7 - Supplier contacts and purchase orders

- Added location supplier contacts and multi-item purchase orders.
- Added atomic full receiving, cancellation of open orders, and order-linked stock movements.

## Stage 7 - Retail stock integration

- Added catalog item selection in retail checkout.
- Added atomic stock deductions, stock and price conflict checks, and sale references in stock history.

## Stage 7 - Partial purchase deliveries

- Added partial delivery quantities, remaining quantities, retry protection and automatic completion after the final delivery.

## Stage 7 - Purchase costs and location inventory reporting

- Added optional catalog purchase costs and historical order snapshots.
- Added a location report for units, low-stock items, cost coverage, and estimated value.

## Stage 8 - Marketing drafts and consent

- Added campaign drafts and tenant-scoped audience counts for completed and repeat visits.
- Added customer-managed business marketing consent and withdrawal.

## Stage 8 campaign capture

Owners and managers can copy a saved draft or record a local campaign capture. Capture checks current consent and visit eligibility, suppresses duplicate retries, and includes a link to withdraw consent in the customer account.

## Stage 8 reusable campaign templates

Owners and managers can save campaign subject, message, and audience as a named business template. They can update templates independently and use them to start new drafts.

## Stage 8 customer reviews

Customers can publish a rating and optional comment from a completed appointment. The account shows the submitted rating, and the salon profile updates its reviews and average.

## Stage 8 business review replies

Business owners and managers can publish, edit, or clear a reply on a published review from the Marketing workspace. Replies appear beneath the review on the public salon profile.

## Stage 8 review reporting

Signed-in users can report a published review from the public salon profile. Reports are private, limited to one per account and review, and stored for moderation.

## Stage 8 review moderation

Platform administrators can open the review moderation queue from their account. The queue shows the newest open report and total open reports per review. Moderators can dismiss reports, hide a review, and restore a hidden review. Each decision that changes state is audited.

## Stage 8 loyalty earning

Business owners and managers can configure points per completed account booking. Customers see balances by business. Completion credits the configured rate once, and rate changes preserve earlier awards.

## Stage 8 rewards, packages, and reminders

Customers can exchange 50 points for a 5 EUR appointment voucher tied to their account. Businesses can publish fixed-term packages for individual services. Customers can simulate a purchase, and staff can use an eligible visit at checkout. Local capture schedules opt-in appointment reminders 24 hours before eligible bookings and follows up with opted-in customers after a completed visit. Businesses can issue transferable gift codes and offer fixed-term memberships with manual renewal.

## Stage 9 business analytics

Owners and managers can filter booking, checkout, and staff activity by date and location. The report shows current inventory at the selected locations and aggregate local campaign capture figures for the business.

## Stage 9 business SaaS plans

Added configurable business plans, a Professional trial for new businesses, simulated activation and cancellation with a billing history, expiry, and enforced location quotas.

## Stage 9 platform business administration

Added a platform-only business directory, a public verification indicator, and audited suspension and reactivation. Suspension hides public listings and related content and blocks new online bookings and package purchases.

## Stage 9 platform customer directory

Added a platform-only customer search and deletion-request queue. Administrators can see existing business ownerships and record a review without clearing the request or deleting the account.

## Stage 9 support cases

Added customer support conversations and a platform administrator queue. Customer and staff replies, closures, and reopenings are recorded in the conversation.

## Stage 9 platform overview and settings

Added platform-only aggregate reports and audited controls for new business registration and support case intake.

## Stage 9 service, staff and customer reporting

Business reports show completed service volume, net appointment receipts by service and staff, and new versus returning customer counts. Multi-service payments and refunds are allocated in proportion to the booked line prices.

## Stage 9 capacity utilization

Location reports show scheduled and occupied staff minutes and utilization. Capacity uses current opening hours and work schedules after subtracting breaks and blocks. Confirmed and completed bookings contribute only within scheduled capacity.
