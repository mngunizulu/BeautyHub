# BeautyHub handoff audit

Baseline: imported Git HEAD 79fb54f. The working tree already contained a deleted Replit conversation attachment and untracked attached assets. The supplied migration brief ends in section 6.

## Architecture and verified scope

| Area | Status | Evidence and gaps |
| --- | --- | --- |
| German React marketplace, Express API and PostgreSQL | IMPLEMENTED_NOT_VERIFIED | React/Vite/TanStack Query/Wouter; published catalog, health check and system endpoints; Drizzle schema and three versioned migrations. Earlier Replit runs are documented in TEST_REPORT. |
| Mockup sandbox | PARTIAL | Separate Vite workspace for design artifacts; no product or production entry point. |
| Consumer discovery | PARTIAL | Search and category/city filters, published profiles, services and opening hours exist. Stage 3 adds dedicated service and price search, richer public profiles, galleries and favorites. |
| Consumer account and business workspace | IMPLEMENTED_NOT_VERIFIED | Clerk-managed sessions map to internal users. Consumer profiles and onboarding, staff, services, variants, publication and cancellation policy settings persist in PostgreSQL. |
| Identity and tenant boundaries | IMPLEMENTED_NOT_VERIFIED | Active membership and organization/role checks protect private operations. Owner-only publication and membership management. Staff views are scoped. Platform role does not grant tenant access. Stage 2 tests cover two tenants, invitations and revocation. |
| Booking, calendar, POS, CRM, inventory and platform administration | NOT_IMPLEMENTED | Models for policy snapshots and opaque payment references exist. Booking items, availability, transactional overlap prevention and downstream workflows remain staged work. |
| Windows baseline and deployment | BLOCKED | Frozen install succeeds, but Linux-only workspace overrides prune Windows native packages. Baseline Vitest fails to start on missing Rollup native package. No DATABASE_URL was inherited. No checked-in Docker or CI configuration was found. |

Database relationships: users join organizations through memberships. Organizations own locations, staff, business service groups, invitations and cancellation policies. Locations expose published catalog fields and hours. Services carry prices, duration and buffers, and have variants and staff assignments. User-scoped payment references contain provider IDs. Audit events cover sensitive operations.

The existing suite includes unit, PostgreSQL-backed API integration and Playwright smoke tests. No live Clerk credentials or production database were used during the handoff. Replit-specific dependencies include the Clerk proxy, managed routing/environment, Vite plugins and connector SDK. Before deployment, review forwarded host and IP trust, external Clerk configuration and production migration ownership.

Baseline blockers above reflect the imported snapshot. The working tree now restores the Windows x64 toolchain and has a smoke-tested local Compose setup. See TEST_REPORT for verification.

Next incremental task: BH-S3.01. Start with service and price filtering against published catalog records. Public staff projections and richer profiles remain part of that task.

## Stage 10 local release-readiness checkpoint

| Area | Evidence | Open before production |
| --- | --- | --- |
| Privacy | Account export includes customer-owned records and is served with no-store. Request review, withdrawal and local synthetic-account erasure are implemented. | Complete erasure and retention workflows, verify external-provider handling, and agree data retention and access procedures. |
| Database recovery | A PostgreSQL 17 custom-format dump of migrated synthetic data restored into a separate database. Both copies had 43 migrations, three locations, nine services, three SaaS plans, one platform settings row and two exclusion constraints. | Rehearse application cutover and restore using target-host configuration and approved backup storage. |
| Identity and deployment | The production-oriented Compose configuration uses loopback ingress, external PostgreSQL and an explicit migration step. | Verify public TLS, trusted proxy topology, runtime and migration role permissions, production Clerk domain and operational monitoring on the intended host. |
| Payments and communication | Booking and billing support local simulation and email capture. | Decide production integration scope and verify the approved payment, mail and fiscal workflows before launch. |
| Release regression | The local test report records PostgreSQL, desktop and mobile browser, and build evidence for covered journeys. | Run release-wide accessibility, performance and end-to-end regression against the release candidate. |

See [the deployment runbook](DEPLOYMENT_DOCKER.md), [the test report](TEST_REPORT.md) and [the POS readiness gaps](POS_FISCAL_GAPS.md).

### Account erasure dependencies

The administrator assessment surfaces counts for ownership, staff profiles, bookings and payments, packages, support cases, accepted booking terms and recorded business actions. It provides a snapshot for review. Before implementing the final erasure action, decide how ownership transfers, active appointments, payment and audit records, retained copies and backups, captured communications, and the corresponding Clerk account will be handled. A withdrawn request drops out of active queues and keeps any existing review acknowledgment linked to its original timestamp.

The local rehearsal requires `BEAUTYHUB_TEST_ERASURE=1`, a Clerk test key, and a verified `+clerk_test@example.com` account with a reviewed request. Erasure and its audit marker commit in one transaction. The marker retains a digest of the Clerk identifier, the administrator reference and the timestamp. Clerk retains the test identity. Active memberships, packages and restrictive foreign keys block the transaction.
