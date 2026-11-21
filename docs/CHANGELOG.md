# Changelog

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
