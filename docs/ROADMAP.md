# Ten-stage roadmap

Statuses: TODO, IN_PROGRESS, BLOCKED, DONE. A task is DONE only after its acceptance checks pass. These identifiers persist across sessions. Each later stage depends on the preceding stage; no later stage is represented as complete by a preliminary foundation slice.

## Stage 1 — Foundation
Requirements: BH-P01–P05, BH-D01–D05, BH-U01–U04, BH-SEC01, BH-DB01–DB02, BH-Q03–Q04.
**Stage status: DONE.** Unit/API tests, strict checking, lint and desktop/mobile Preview rendering passed. Browser interaction tests are configured but NOT RUN; see TEST_REPORT.

| Task | Objective | Dependency | Acceptance and tests | Status |
|---|---|---|---|---|
| BH-S1.01 | Preserve starter, establish architecture and continuity docs | None | Document stack, boundaries, full spec, roadmap, recovery and no-publish constraint | DONE |
| BH-S1.02 | Development database and narrow public catalog | S1.01 | Versioned migration applied; idempotent seed; real persisted profiles/services/counts; DB constraints and integration tests | DONE |
| BH-S1.03 | Authentication/security foundations | S1.01 | No credential simulation; guest status; forged roles cannot access private API; policy and API tests | DONE |
| BH-S1.04 | Responsive connected German frontend and live health | S1.02–03 | Preview renders; actual queries, URL filters/details, retry/empty states, mobile layout, honest future-stage messaging | DONE |
| BH-S1.05 | Test tooling, validate and record checkpoint/state | S1.02–04 | Full feasible unit/API suite, strict typecheck, lint, Preview screenshot; actual results recorded, browser smoke tooling established | DONE |

Checkpoint limitation: Replit manages checkpoints automatically, but no addressable checkpoint identifier or checkpoint-creation control was exposed in this session. No manual checkpoint or Git commit is claimed. Recovery documentation and versioned development migrations are saved.

## Stage 2 — Authentication and business onboarding
**Status: DONE (development scope; verification limitations in TEST_REPORT).** Depends on Stage 1. Requirements BH-C01, BH-B01/B06, BH-T01–T03, BH-SEC01–02. The supplied Stage 2 brief also explicitly includes service/variant administration, versioned cancellation-policy configuration and payment-provider data foundations; these are not an active Stage 4 booking engine.
- **BH-S2.01:** Integrate managed Clerk, verified session→user mapping, register/login/logout, verification/recovery and secure session behavior. Tests: valid/invalid/expired identity, logout and guest boundaries.
- **BH-S2.02:** Organization/location creation and guided business profile/hours/onboarding with validation and ownership. Tests: persistence and permission failures.
- **BH-S2.03:** Roles/memberships/employee invitations, exact organization/location authorization. Tests: two authenticated tenants, read/write IDOR, privilege escalation, multi-membership and ordinary-user admin denial.
Acceptance: genuine consumer/business accounts and protected onboarding, no cross-tenant access.

## Stage 3 — Marketplace
**Status: DONE (development scope).** Depends on Stage 2. Dedicated service and variant name/price filters and opt-in public staff profiles are implemented and API-tested. Gallery management and account-backed favorites are implemented and API-tested. Public responsive discovery passed on desktop and mobile Chromium. Signed-in owner/customer browser acceptance passed on both devices. Requirements BH-C02–C04, BH-U01–U04.
- **BH-S3.01:** Full business/service search, price/location/category filters, catalog/staff profiles.
- **BH-S3.02:** Public profile management, gallery storage, publication/moderation boundaries.
- **BH-S3.03:** Account-backed favorites and complete responsive discovery workflow.
Tests/acceptance: search/filter combinations, visibility, upload validation/access, favorite persistence/ownership, responsive discovery E2E. Stage 4 added booking-date availability filtering.

## Stage 4 — Booking engine — first usable product milestone
**Status: DONE (development scope).** Depends on Stage 3. Requirements BH-C05, BH-B02–B04, BH-Q01–Q02.
- **BH-S4.01:** Staff/service/resource eligibility, working hours, leave/holidays/buffers and availability with lead/advance restrictions. Date-filtered search and real slots use the same scheduler.
- **BH-S4.02:** Transaction-safe idempotent booking and exclusive resource/employee conflict protection.
- **BH-S4.03:** Customer appointments/history, cancellation/reschedule, waitlist and in-app notifications; business calendar synchronization.
Tests/acceptance: unit availability/buffer/policy rules, DST gaps/folds, simultaneous conflict attempts, idempotent repeats, eligibility and complete consumer→business calendar E2E.

## Stage 5 — Business operations and CRM
**Status: DONE (development scope).** Depends on Stage 4. Requirements BH-B02/B05–B07.
- **BH-S5.01:** Day/week/month/staff calendar filters, manual/walk-in appointments and status editing are implemented. Calendar rescheduling uses date drop targets and an accessible move form, both backed by the shared slot engine.
- **BH-S5.02:** Employee management, breaks/time off, service assignments and resources.
- **BH-S5.03:** Private CRM/search/history/notes/preferences/tags/attachments/segmentation, separate from global consumer profile.
Tests/acceptance: calendar writes reflected in consumer view, shared conflict rules, tenant-private CRM read/write/upload isolation, permissions and operational browser journey.

## Stage 5.5 — Public booking experience

**Status: DONE for local development.** Depends on Stage 5.

- **A. Professional selection and differential pricing:** Named and automatic selection, public staff details, exact slot pricing, and historical quote snapshots are implemented. Consecutive services can be assigned to separate professionals in one appointment, with a database reservation for each interval.
- **B. Multi-service booking experience:** Implemented grouped service selection, the live weekly availability calendar, private appointment notes, the exact checkout itinerary, and separately configurable rescheduling notice.
- **C. Public business details:** Implemented editable public contact details, logo and social link, address-based or coordinate-based map links, and sortable published reviews. Customer review submission is implemented in Stage 8.
- **D. Booking notifications:** Implemented local capture and an opt-in HTTPS gateway for confirmation, reschedule and cancellation emails, with retry and delivery state. Account and email calendar files use stable event IDs and revisions.

## Stage 6 — Payments and POS
**Status: DONE for local development.** Depends on Stage 5.5. Requirements BH-C06, BH-F01–F02.
- **BH-S6.01:** Appointment ledger and simulated provider adapter implemented. Owners and managers can record cash or simulated card deposits and settle the remaining balance after completion.
- **BH-S6.02:** Appointment-level refund records and downloadable internal payment receipts are implemented. Appointment transaction history is available by location and local record date. Completed appointment checkout supports fixed discounts when a positive balance remains. Retail checkout supports manually entered line items, cash and simulated cards, and internal receipts. Retail refunds support partial or full reversals with receipt and reconciliation updates. Owners and managers can issue one-use fixed promotional vouchers for appointment settlement or retail checkout. Customers can view their own appointment payment and refund history.
- **BH-S6.03:** Implemented daily appointment payment and refund totals and a cash discrepancy check. Retail sales are included in transaction history and daily payment totals. The [German POS fiscal gap assessment](POS_FISCAL_GAPS.md) identifies the remaining production work.
Tests/acceptance: integer-cent arithmetic, tax/discount/refund rules, duplicate-payment concurrency/idempotency, authorized receipts and consistent ledger; no live card processing or fiscal claims.

## Stage 7 — Inventory
**Status: DONE for local development.** Depends on Stage 6. Requirements BH-I01–I02.
- **BH-S7.01:** Implemented a location catalog with normalized SKUs, retail prices, category, supplier name, and an HTTPS image URL. Optional purchase costs are editable and snapshotted on new purchase orders.
- **BH-S7.02:** Implemented direct goods receipts, corrections, movement history and low-stock indicators. Added location supplier contacts and multi-item purchase orders with partial or full receiving and cancellation of the outstanding order.
- **BH-S7.03:** Catalog items now deduct stock in the same transaction as retail checkout and appear in movement history. The location inventory report shows units, low-stock items, units missing a cost, and an estimate using current recorded purchase costs.
Tests/acceptance: invalid/duplicate stock transitions, concurrent sales, location isolation, receiving and retail checkout integration.

## Stage 8 — Marketing and retention
**Status: DONE for local development.** Depends on Stage 7. Requirements BH-M01–M02, BH-R01, BH-C06.
- **BH-S8.01:** Implemented editable campaign drafts, aggregate audience previews, and per-business consent and withdrawal in customer accounts. Development-only capture rechecks consent, keeps a private history, and includes a signed-in preference link. Owners and managers can copy drafts or save reusable templates, update templates independently, and use them to start new campaigns. Local capture schedules appointment reminders 24 hours before eligible bookings and opt-in post-visit follow-ups with an account preference link. Live campaign delivery requires provider approval.
- **BH-S8.02:** Businesses issue fixed promotional codes, award loyalty points and offer fixed-term service packages with simulated purchases. Customers exchange 50 points for a single-use 5 EUR voucher tied to their account. Staff can apply package visits at checkout. Businesses can also issue transferable single-use gift vouchers and offer fixed-term consumer memberships with included visits and manual renewal.
- **BH-S8.03:** Customers can publish one review per completed appointment from their account. Public review lists and rating summaries update immediately. Owners and managers can publish, edit, and clear public replies in the Marketing workspace. Signed-in users can privately report a published review with a reason and optional details. Reports leave the review visible while awaiting a moderation decision. Platform administrators can dismiss reports, hide reviews from public listings and rating summaries, and restore hidden reviews. Moderation decisions are audited.
Tests/acceptance: opt-out enforced, no unauthorized sends, discount/redemption concurrency, review eligibility/uniqueness, private audience boundaries.

## Stage 9 — Analytics and administration
**Status: DONE for local development.** Depends on Stage 8. Requirements BH-A01, BH-PA01, BH-S01–S02, BH-B07.
- **BH-S9.01:** The owner and manager workspace reports booking status, recorded payments and refunds, completed services by staff, current stock, and captured campaign activity. The report supports a date range and location filter. Marketing totals cover the entire business. Service and staff reports allocate recorded appointment payments and refunds by booked service price. Completed service counts and new versus repeat customer counts are available. Location capacity utilization measures confirmed and completed bookings against current staff schedules and opening hours, after excluding breaks and blocks.
- **BH-S9.02:** Platform administrators can configure Starter, Professional and Enterprise plans. New businesses receive the configured Professional trial. Owners can switch, reactivate or cancel from the business workspace. Activation records a simulated 30-day billing period. Expired and cancelled plans block additional locations, and active plans enforce location quotas. Businesses created before this feature keep their existing access until they choose a plan.
- **BH-S9.03:** Platform-only business directory, verification, suspension and reactivation are implemented with audited actions and public marketplace enforcement. Review moderation and plan configuration are available. The customer directory includes a deletion-request queue with active ownership counts and audited review acknowledgments. Account erasure remains part of Stage 10. Customers can open private support cases and exchange messages with platform administrators. The support queue includes status filters and records closures and reopenings in the conversation. The platform overview reports business and customer status, booking activity, subscription state, simulated billing and support counts. Platform administrators can pause new business registrations and new support cases. Changes are audited.
Tests/acceptance: aggregates reconcile with source records, plan state transitions enforce entitlements, tenant-role/admin denial tests, no salon memberships/SaaS-plan confusion.

## Stage 10 — Integration and release readiness
**Status: DONE for local development.** Production launch gates remain open. Depends on Stage 9. Requirements BH-SEC01–02, BH-EXT01, BH-Q01–Q03.
- **BH-S10.01:** Marketplace, account, workspace and platform route code loads on demand. The initial JavaScript entry is 26% smaller in local production builds. Local regression passed with 75 PostgreSQL-backed tests and 14 browser cases across desktop and mobile. The production dependency audit returned zero advisories. Broader security, manual accessibility and target-host performance reviews remain open.
- **BH-S10.02:** Account exports include account-owned activity. Customers can withdraw deletion requests. Platform administrators can assess linked records and active ownership before recording a review. Local erasure can be rehearsed on reviewed synthetic Clerk accounts. Production erasure, retention decisions and the processor/hosting review remain open.
- **BH-S10.03:** The deployment runbook includes a PostgreSQL backup and restore procedure, rehearsed on synthetic data. Approved integration configuration and verification against the intended production infrastructure remain open.
Acceptance: readiness checklist has evidence and explicit unresolved risks. No publishing, paid services, real payment provider or German fiscal compliance without separate authorization/review. AI receptionist interface remains a future extension using shared services; voice/WhatsApp is not early-stage scope.
