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
