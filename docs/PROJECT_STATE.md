# Project state

## Recovery snapshot
- **Current stage:** 2 — Authentication and business onboarding, DONE for the supplied development scope; not production-ready.
- **Current task:** None active. Do not start Stage 3 without the user's instruction.
- **Last completed task:** BH-S2.01–03 and the latest Stage 2 brief's service/policy/payment-model foundations.
- **Implemented:** Preserved Stage 1 catalog/foundation; added managed identity bridge/profile/preferences, active organization memberships, atomic draft onboarding, structured addresses/hours, staff/templates, single-use verified-recipient invitations, service groups/variants/assignments/archival, versioned policy configuration, export/deletion-request/payment-reference foundations and audit records.
- **Working components:** API/frontend in Preview; additive development migrations applied with legacy address backfill. Original 3 public demo businesses/9 services/9 categories remain. Real managed consumer, owner onboarding, staff/service/policy administration and published Essen discovery were exercised; the browser test business was then unpublished and its private data retained.
- **Scope:** Stage 2 accounts/business administration plus preserved public discovery. Seed studios remain fictional; user-entered published businesses are not labeled synthetic. No booking engine, payment collection or publication.
- **Known limitations:** Real inbox recovery/interactive provider CAPTCHA flow was not exercised (managed test helper used for identity). Invitations are manually shared, not emailed. Export/deletion are workflow foundations, not full legal erasure/retention compliance. Booking, real card setup/charges, complete marketplace/uploads and production review remain later-stage scope.
- **Latest test results:** 53/53 unit/API tests passed including Stage 1 regressions; strict typecheck, ESLint and frontend production build passed. Full real browser onboarding/public discovery completed; its hours/settings overwrite was fixed and the targeted browser recheck passed in both directions, including refresh. See `TEST_REPORT.md`.
- **Active blockers:** None currently. Managed Clerk was provisioned for the requested authentication integration; no payment/email services or publication activated.
- **Stage 2 result:** Implemented and verified the requested accounts, memberships, six-step onboarding, business/staff/services/variants/hours/policy settings, invitation security/audits and inactive payment-provider foundations without replacing Stage 1.
- **Exact next action:** User review in Preview. Stage 3 remains unstarted; no deployment or paid service activation is authorized.
- **Checkpoint:** Platform-managed checkpointing; no specific checkpoint reference or creation control was exposed. No manual checkpoint/commit claimed (Git CLI reported no repository). All source and recovery documents are saved.

## Relevant files
- UI: `artifacts/beautyhub/src/{App.tsx,index.css,pages,components,lib/format.ts}`.
- API: `artifacts/api-server/src/{app.ts,routes,repositories/catalog.ts,lib/authorization.ts,middlewares/authentication.ts}`.
- Database: `lib/db/src/schema/{identity.ts,catalog.ts}`, `lib/db/drizzle/`, `lib/db/src/seed.ts`.
- Contract: `lib/api-spec/openapi.yaml`; regenerate instead of hand-editing generated files.
- Tests: `vitest.config.ts`, API `*.test.ts`; browser smoke config/spec under root and `tests/`.

## Operations and safety
No publication or paid service activation has occurred or is authorized. No production database changes. Use managed workflows; required database environment is already supplied securely. No actual consumer accounts or platform administrators have been seeded. Replit creates checkpoints automatically; do not invent a checkpoint identifier.
