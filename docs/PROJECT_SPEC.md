# BeautyHub product specification

## Scope and requirement identifiers
Source: the user's **BEAUTYHUB — COMPLETE MASTER DEVELOPMENT INSTRUCTIONS**, supplied with this project. The following requirements cover the full product; implementation is staged, not a claim that these features already exist. Current delivery is Stage 1. Requirements are grouped by stable IDs; roadmap tasks reference these groups.

### Product and architecture
- **BH-P01:** Original German-first multi-tenant beauty/wellness marketplace and SaaS serving consumers, businesses and platform administrators; no copied Salonkee branding or assets.
- **BH-P02:** Genuine integrated frontend, backend, persistence, authorization, validation and tests. Preserve valid work; modular monolith first, portable TypeScript architecture, no Docker/microservices/Kubernetes requirement.
- **BH-P03:** React/TypeScript, accessible reusable Tailwind components, server-state query management, appropriate typed forms/validation; structured Node API and documented REST contracts; normalized PostgreSQL and Drizzle/Prisma with versioned migrations, constraints and indexes.
- **BH-P04:** Use supported Replit infrastructure after checking documentation. Secrets in environment, appropriate persistent file storage when uploads arrive, Preview/checkpoints/task tracking/testing where available. Do not assume integrations exist or activate paid services or publish without approval.
- **BH-P05:** Incremental testable changes; functional correctness, consistency, security, booking reliability and tests take priority over polish or optional features. Avoid silent fallbacks and disconnected mockups.

### Continuity and execution
- **BH-D01:** Maintain concise `replit.md`, complete specification with requirement IDs, architecture, ten-stage roadmap, decisions, state, actual test report, changelog and release-readiness checklist.
- **BH-D02:** State records current stage/task, last task, implemented/working components, issues/tests/blockers, exact next action and relevant files. At session start read instructions/state/roadmap and verify actual application state.
- **BH-D03:** For each task: objective, dependency, criteria, tests and TODO/IN_PROGRESS/BLOCKED/DONE status. Inspect, test, implement, validate, fix/regression-check, document, checkpoint. A feature is complete only when integrated and verified.
- **BH-D04:** Concise task delivery report: task, actual implementation, main files, executed tests, issues, available checkpoint and next task. Never fabricate checks or checkpoints. Record NOT RUN and reasons.
- **BH-D05:** On failure capture the error, diagnose, fix and rerun the relevant check; do not blindly repeat failing commands, weaken tests, rewrite valid code or blindly roll back data.

### UX and localization
- **BH-U01:** Commercial-quality original responsive consumer experience, efficient information-dense business workflows and secure operational administration; consistent shared controls for forms, dialogs, tables, calendars and navigation.
- **BH-U02:** Accessible controls; loading, error, retry, empty, success, confirmation, validation and permission states where relevant. Every visible control performs a meaningful action or explicitly identifies a future-stage unavailable capability.
- **BH-U03:** German primary, de-DE dates, euro formatting, appropriate time zones/DST; prepare English localization without duplicated application logic.
- **BH-U04:** Consumer/business changes synchronize through the same backend. Synthetic demo fixtures must be clearly distinguished from real data. No fake ratings, appointments or successful financial/auth actions.

### Consumer requirements
- **BH-C01:** Registration/login/logout, secure credentials via managed identity, verification, password recovery, profile/contact information, notification preferences, account settings, account deletion and personal-data export.
- **BH-C02:** Search businesses by name, city/location, category and specific service; filter by price and genuine appointment availability, compare services, browse published profiles, save favorites.
- **BH-C03:** Public profiles show name, description, address/location, hours, contact details, categories, services, prices, durations, employees, photos, reviews/ratings, availability and booking actions; never private/unpublished data.
- **BH-C04:** Initial categories: hair salons, barbershops, nails, beauty, massage, wellness, spas, skincare, eyebrows/eyelashes.
- **BH-C05:** Journey: business → service → specific/any eligible professional → genuinely available slot → date/time → review → confirmation; upcoming appointments/history, eligible cancellation/rescheduling, waiting lists and reminders.
- **BH-C06:** Development-simulated payments, deposits/pay-at-salon, vouchers, promo codes, loyalty, eligible consumer memberships/packages, payment history, refund status and reviews.

### Business onboarding and scheduling
- **BH-B01:** Business account/organization registration and guided onboarding; locations, details/hours, employees, services/prices/durations, images, booking/cancellation policies and publish/unpublish controls.
- **BH-B02:** Calendar day/week/month and employee views; create/edit/manual/walk-in/cancel/status appointments, drag/drop rescheduling, filters, service colors, breaks/absence/blocks and resources.
- **BH-B03:** One shared scheduling engine for public booking, business edits and future authorized AI operations. Respect employee/business hours, holidays/leave, duration, preparation/cleanup buffers, eligibility, resources, lead time, advance restrictions and cancellation/rescheduling policies.
- **BH-B04:** Transaction-safe database-backed prevention of exclusive employee/resource overlap; no frontend-only or check-before-save protection. Appropriate idempotency, UTC instants, location timezone and DST correctness.

### CRM, team and locations
- **BH-B05:** Organization-private CRM profiles, notes/preferences/tags, search, visit frequency/service/appointment history, segmentation, attachments and communication preferences. Global consumer accounts remain logically separate from each business's private record.
- **BH-B06:** Employee profiles/invitations/memberships, roles/permissions, service assignments, schedules/time off/availability, optional time tracking, performance reporting and activity/audit history.
- **BH-B07:** Multi-location organizations with separate staff, services, hours, calendars, resources, inventory and reports, plus consolidated organization reporting.

### Finance, inventory and retention
- **BH-F01:** Appointment/retail checkout, payment status, cash records, simulated electronic payments, deposits, refunds, discounts/vouchers, receipts, transaction history, daily sales and reconciliation.
- **BH-F02:** Payment-provider abstraction; no real card handling in development; integer minor units/appropriate decimals; explicit separate TSE/DSFinV-K assessment, no fiscal compliance claims.
- **BH-I01:** Product catalog, SKU/category/images, purchase/retail prices, stock/low-stock alerts, suppliers/purchase orders/goods receipt, adjustments/movement history, reporting and per-location inventory.
- **BH-I02:** POS sales update inventory consistently; protect against duplicate deductions, invalid transitions and concurrent writes.
- **BH-M01:** Promotions/campaigns/email templates, codes/segments, reminders/follow-ups, loyalty earning/redemption, gift vouchers, memberships/service packages, history and communication preferences.
- **BH-M02:** Consent/unsubscribe controls; simulated or captured messages until a real provider is approved.
- **BH-R01:** Appointment-eligible completed-visit ratings/reviews, business replies, moderation/reporting and summaries; prevent duplicate/unauthorized reviews.
- **BH-A01:** Actual-data reporting for revenue by service/staff, appointment/cancellation/no-show volume, popular services, new/repeat customers, utilization, transaction value, retail, inventory and measurable marketing performance.

### Platform, subscriptions and authorization
- **BH-PA01:** Separate backend-protected platform administration: business/customer management, verification/suspend/reactivate, reviews, support cases, plans, settings, platform analytics and appropriate audit logs.
- **BH-S01:** Configurable Starter/Professional/Enterprise business SaaS plans with prices/entitlements/trials/states, upgrade/downgrade/cancel/expire, history and enforced restrictions. Development simulated billing only.
- **BH-S02:** Business SaaS subscriptions are not the consumer memberships sold by salons. Production billing requires separately approved provider.
- **BH-T01:** Guest/consumer/business owner/manager/employee/platform-admin roles; multiple roles and business memberships per user.
- **BH-T02:** Every sensitive operation authorizes the exact organization and relevant location from verified identity and persisted permissions; never trust frontend tenant IDs or claimed roles.
- **BH-T03:** Explicit cross-business read/write, IDOR, privilege-escalation and leakage tests. Platform-admin controls are not granted through client manipulation.

### Security, privacy, schema and integrations
- **BH-SEC01:** Secure authentication/password storage if locally managed, session controls, server validation, rate limits, safe uploads, secret management, appropriate audit logs and common-web-vulnerability protection.
- **BH-SEC02:** GDPR-aware EU/German design: processor agreements/hosting/consent/retention, export/deletion workflows and safe customer records. No legal compliance claims without review; no real customer fixtures.
- **BH-DB01:** Model users, organizations, memberships, locations, employees, categories/services/assignments, schedules/absence/resources, customers, appointments/history/waiting lists, notifications, payments/transactions/refunds/receipts, products/inventory/suppliers/orders, promotions/vouchers/loyalty, reviews/packages, SaaS subscriptions/plans and audit events as their stages arrive.
- **BH-DB02:** Foreign keys, uniqueness and appropriate indexes/constraints, preserve data, versioned migrations; do not prematurely create all tables. Development and production stay separate. No destructive production action without approval.
- **BH-EXT01:** Payments, email/SMS, domains, uploads, monitoring, backup services, fiscal integration and AI telephony require later evaluation/approval. Document missing integrations; safe explicit development adapters are acceptable.
- **BH-AI01:** Future receptionist may answer service/price/availability questions and make authorized bookings/changes through the same domain/security services, with staff escalation. No uncontrolled financial transactions; voice/WhatsApp later.

### Testing and stage acceptance
- **BH-Q01:** Mandatory unit tests for rules (availability, buffers, prices/discounts, cancellation, loyalty/tax, permissions, inventory); API integration for identity/onboarding/auth, DB, booking/cancellation, staff/CRM, finance, inventory and entitlements as implemented.
- **BH-Q02:** Concurrent appointment/resource, payment, loyalty and stock safety tests where applicable; regression tests for significant fixes.
- **BH-Q03:** Browser-based consumer-to-business E2E journey, strict TypeScript, ESLint, Vitest/Jest and Playwright tooling. Run relevant checks at task boundaries and full feasible suite at stage boundaries; report limitations honestly.
- **BH-Q04:** Stage 1 specifically delivers documented architecture/roadmap, development PostgreSQL, application structure, authentication boundaries, testing tools, working responsive frontend/API health, Preview verification and recorded results/state/checkpoint. Do not stop at documentation; do not implement all stages at once or publish.

## Current executable surface
Public development catalog: categories, published salons, literal name/service/city/category filtering, profiles/services/hours, actual counts; German responsive UI; operational health and stage status. All demo salons are fictional. No accounts/bookings/reviews/finance/CRM claims are made. See `ROADMAP.md` and `PROJECT_STATE.md` for actual completion.
