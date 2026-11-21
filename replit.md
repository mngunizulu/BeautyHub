# BeautyHub

German-first beauty and wellness marketplace plus multi-tenant salon management, built incrementally. The original product brief governs the ten-stage scope. Current work is **Stage 1 only**; the first usable booking milestone is Stage 4.

## Recover a session
Read this file, `docs/PROJECT_STATE.md`, the relevant tasks in `docs/ROADMAP.md`, then only relevant source. Verify actual code/database/test state; fix documentation discrepancies. Never regenerate completed functionality.

## Stack and structure
- TypeScript strict, pnpm workspace, React/Vite, Tailwind, TanStack Query and Wouter.
- Express modular monolith in `artifacts/api-server/src/`; routes validate, repositories query, domain policies remain separate.
- React app in `artifacts/beautyhub/`. Shared theme and reusable controls stay there.
- PostgreSQL/Drizzle schema in `lib/db/src/schema/`, versioned development migrations in `lib/db/drizzle/`.
- Contract in `lib/api-spec/openapi.yaml`, generated client/Zod packages in `lib/api-client-react` and `lib/api-zod`.
- Product, architecture, decisions, roadmap, test evidence and readiness in `docs/`.

## Run and validate
- Managed workflows: `artifacts/api-server: API Server` and `artifacts/beautyhub: web`. Use managed startup; PORT/BASE_PATH are injected. API binds `0.0.0.0`.
- `pnpm --filter @workspace/api-spec run codegen` after every API contract change.
- `pnpm --filter @workspace/db run generate` to create a versioned schema migration.
- `NODE_ENV=development pnpm --filter @workspace/db run migrate:dev` to apply development migrations.
- `NODE_ENV=development pnpm --filter @workspace/db run seed:dev` for idempotent, fictional development fixtures.
- `pnpm test` runs unit and real-development-database API integration tests with isolated temporary fixtures.
- `pnpm run typecheck` and `pnpm lint`.
- `pnpm test:e2e` runs configured browser smoke tests against the preview (not run on initial build).
- Never log secrets. DATABASE_URL is provided through the environment; do not paste or print it.

## Non-negotiable constraints
- Do not publish or activate paid/external services without explicit approval.
- Use real persistence. Demo data and simulated payment/message adapters must be visibly labelled.
- Stage 1 has a public, read-only synthetic catalog. No account, booking, or payment success may be simulated.
- Managed Clerk is the planned identity provider; Stage 1 private API namespaces fail closed with 401. Do not build local passwords/JWTs. Full identity integration is Stage 2.
- Derive tenant permissions from verified identity and persisted memberships, never caller-supplied tenant/role headers. Platform administration does not implicitly expose salon-private CRM.
- Primary locale de-DE, EUR integer minor units, Europe/Berlin. Prepare centralized translations; do not implement English by duplicating business logic.
- Only expose explicit published public fields. Private CRM and global consumer profiles stay separate.
- Booking engine must eventually enforce overlap/concurrency in the database and be shared by every actor, including a future AI receptionist.
- No production DDL/startup migrations. Managed production schema is handled by Publish, only after authorization.
- No real customer fixtures or compliance claims. GDPR and German fiscal compliance require separate review.

## Required workflow
Take the next incomplete roadmap task; identify acceptance criteria; inspect existing code; add tests; implement; run relevant tests; fix regressions; update state/report/changelog; use Replit's automatic checkpoint. At stage boundaries run the full feasible suite, record actual commands and NOT RUN checks. Never claim unverified success or weaken tests to pass.
