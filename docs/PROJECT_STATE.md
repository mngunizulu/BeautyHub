# Project state

## Recovery snapshot
- **Current stage:** 1 — Foundation, DONE.
- **Current task:** None active; next planned task is BH-S2.01.
- **Last completed task:** BH-S1.05 — final validation and evidence.
- **Implemented:** React web app, API contracts/client/validators, live DB health, database-backed public catalog/category/search/profile/service/hours/summary, stage status, guest session, denied private namespaces, pure authorization policies, security middleware, versioned schema, synthetic seed and test tooling.
- **Working components:** API and frontend managed workflows running in Preview; development migration applied; seed rerun without duplicates; public catalog has 3 salons/9 services/9 categories. Live health returns connected, profile returns services/hours, administrator namespace returns 401.
- **Scope:** Only foundation plus narrow read-only catalog proof. All studios fictional; no booking/account/payment operation simulated.
- **Known issues:** Managed identity not configured (Stage 2 by design); no authenticated tenant workflows yet. Playwright interactions NOT RUN. Full marketplace, bookings, payments and operations remain later-stage scope.
- **Latest test results:** 27/27 Vitest unit/API tests passed; full strict workspace typecheck and ESLint passed. Six Playwright cases discovered only, not executed. Desktop homepage and mobile profile rendered without browser errors. See `TEST_REPORT.md`.
- **Active blockers:** None for Stage 1. Provider/legal/production setup is outside this stage.
- **Exact next action:** BH-S2.01: integrate managed Clerk identity and verified internal user/session mapping, then registration/login/logout/verification/recovery and their tests. Do not rewrite the foundation or unlock private endpoints before identity and database membership authorization are wired.
- **Checkpoint:** Platform-managed checkpointing; no specific checkpoint reference or creation control was exposed. No manual checkpoint/commit claimed (Git CLI reported no repository). All source and recovery documents are saved.

## Relevant files
- UI: `artifacts/beautyhub/src/{App.tsx,index.css,pages,components,lib/format.ts}`.
- API: `artifacts/api-server/src/{app.ts,routes,repositories/catalog.ts,lib/authorization.ts,middlewares/authentication.ts}`.
- Database: `lib/db/src/schema/{identity.ts,catalog.ts}`, `lib/db/drizzle/`, `lib/db/src/seed.ts`.
- Contract: `lib/api-spec/openapi.yaml`; regenerate instead of hand-editing generated files.
- Tests: `vitest.config.ts`, API `*.test.ts`; browser smoke config/spec under root and `tests/`.

## Operations and safety
No publication or paid service activation has occurred or is authorized. No production database changes. Use managed workflows; required database environment is already supplied securely. No actual consumer accounts or platform administrators have been seeded. Replit creates checkpoints automatically; do not invent a checkpoint identifier.
