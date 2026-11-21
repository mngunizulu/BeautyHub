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
**Status: TODO.** Depends on Stage 1. Requirements BH-C01, BH-B01/B06, BH-T01–T03, BH-SEC01–02.
- **BH-S2.01:** Integrate managed Clerk, verified session→user mapping, register/login/logout, verification/recovery and secure session behavior. Tests: valid/invalid/expired identity, logout and guest boundaries.
- **BH-S2.02:** Organization/location creation and guided business profile/hours/onboarding with validation and ownership. Tests: persistence and permission failures.
- **BH-S2.03:** Roles/memberships/employee invitations, exact organization/location authorization. Tests: two authenticated tenants, read/write IDOR, privilege escalation, multi-membership and ordinary-user admin denial.
Acceptance: genuine consumer/business accounts and protected onboarding, no cross-tenant access.

## Stage 3 — Marketplace
**Status: TODO.** Depends on Stage 2. Requirements BH-C02–C04, BH-U01–U04.
- **BH-S3.01:** Full business/service search, price/location/category filters, catalog/staff profiles.
- **BH-S3.02:** Public profile management, gallery storage, publication/moderation boundaries.
- **BH-S3.03:** Account-backed favorites and complete responsive discovery workflow.
Tests/acceptance: search/filter combinations, visibility, upload validation/access, favorite persistence/ownership, responsive discovery E2E. Genuine availability filtering completes with Stage 4 engine.

## Stage 4 — Booking engine — first usable product milestone
**Status: TODO.** Depends on Stage 3. Requirements BH-C05, BH-B02–B04, BH-Q01–Q02.
- **BH-S4.01:** Staff/service/resource eligibility, working hours, leave/holidays/buffers and availability with lead/advance restrictions.
- **BH-S4.02:** Transaction-safe idempotent booking and exclusive resource/employee conflict protection.
- **BH-S4.03:** Customer appointments/history, cancellation/reschedule, waitlist and captured notifications; business calendar synchronization.
Tests/acceptance: unit availability/buffer/policy rules, DST gaps/folds, simultaneous conflict attempts, idempotent repeats, eligibility and complete consumer→business calendar E2E.

## Stage 5 — Business operations and CRM
**Status: TODO.** Depends on Stage 4. Requirements BH-B02/B05–B07.
- **BH-S5.01:** Day/week/month/staff calendars, manual/walk-in appointments, drag/drop/status editing through shared engine.
- **BH-S5.02:** Employee management, breaks/time off, service assignments and resources.
- **BH-S5.03:** Private CRM/search/history/notes/preferences/tags/attachments/segmentation, separate from global consumer profile.
Tests/acceptance: calendar writes reflected in consumer view, shared conflict rules, tenant-private CRM read/write/upload isolation, permissions and operational browser journey.

## Stage 6 — Payments and POS
**Status: TODO.** Depends on Stage 5. Requirements BH-C06, BH-F01–F02.
- **BH-S6.01:** Provider abstraction and explicit simulated electronic/cash/deposit transactions.
- **BH-S6.02:** Appointment/retail checkout, discounts/vouchers, receipts/refunds/history.
- **BH-S6.03:** Daily sales/reconciliation and fiscal-compliance gap assessment.
Tests/acceptance: integer-cent arithmetic, tax/discount/refund rules, duplicate-payment concurrency/idempotency, authorized receipts and consistent ledger; no live card processing or fiscal claims.

## Stage 7 — Inventory
**Status: TODO.** Depends on Stage 6. Requirements BH-I01–I02.
- **BH-S7.01:** Location products/SKUs/categories/prices/images/suppliers.
- **BH-S7.02:** Orders/goods receipt, adjustments, movement history/low-stock alerts.
- **BH-S7.03:** Transactional POS-stock integration and reporting.
Tests/acceptance: invalid/duplicate stock transitions, concurrent sales, location isolation, receiving and retail checkout integration.

## Stage 8 — Marketing and retention
**Status: TODO.** Depends on Stage 7. Requirements BH-M01–M02, BH-R01, BH-C06.
- **BH-S8.01:** Captured notifications, templates/campaigns/segments/preferences and consent/unsubscribe.
- **BH-S8.02:** Promotions, vouchers, loyalty earning/redemption and consumer memberships/packages.
- **BH-S8.03:** Completed-appointment reviews/replies/reports/moderation and rating summaries.
Tests/acceptance: opt-out enforced, no unauthorized sends, discount/redemption concurrency, review eligibility/uniqueness, private audience boundaries.

## Stage 9 — Analytics and administration
**Status: TODO.** Depends on Stage 8. Requirements BH-A01, BH-PA01, BH-S01–S02, BH-B07.
- **BH-S9.01:** Actual-data business/staff/inventory/marketing and multi-location reporting.
- **BH-S9.02:** Configurable SaaS plans, trial/state changes, entitlements and simulated billing.
- **BH-S9.03:** Separate protected platform administration, verification/suspension/moderation/support/audit.
Tests/acceptance: aggregates reconcile with source records, plan state transitions enforce entitlements, tenant-role/admin denial tests, no salon memberships/SaaS-plan confusion.

## Stage 10 — Integration and release readiness
**Status: TODO.** Depends on Stage 9. Requirements BH-SEC01–02, BH-EXT01, BH-Q01–Q03.
- **BH-S10.01:** Complete regression/E2E/concurrency, security/performance/accessibility reviews.
- **BH-S10.02:** Privacy export/deletion/retention/consent, processor/hosting/legal review, audit design.
- **BH-S10.03:** Approved integration configuration, deploy configuration, documented platform backup/recovery and production readiness assessment.
Acceptance: readiness checklist has evidence and explicit unresolved risks. No publishing, paid services, real payment provider or German fiscal compliance without separate authorization/review. AI receptionist interface remains a future extension using shared services; voice/WhatsApp is not early-stage scope.
