# Release readiness

**Not ready for production. Do not publish.** Stage 1 is a development foundation, not a complete marketplace or compliant business/POS product.

## Foundation gates
- [x] Architecture, API contracts and continuity documentation.
- [x] Development schema, migration and visibly synthetic seed.
- [x] Public-only catalog projections and private-namespace deny-by-default boundaries.
- [x] Final Stage 1 typecheck/lint/tests/desktop-mobile Preview evidence (see TEST_REPORT; browser interactions remain NOT RUN).

## Later production gates — all outstanding
- [ ] Verified managed identity, account lifecycle and session security; independent dev/prod users.
- [ ] Real tenant/location RBAC and authenticated IDOR/read/write/admin tests.
- [ ] Transaction-safe scheduling, exclusive resources, idempotency and DST/concurrency tests.
- [ ] Validated protected uploads with persistent file storage.
- [ ] End-to-end consumer/business/calendar workflows and complete regression suite.
- [ ] Financial/stock integrity and any separately approved real provider, with no raw card handling.
- [ ] German TSE/DSFinV-K assessment before fiscal cash-register claims.
- [ ] Consent/unsubscribe, privacy export/deletion/retention, EU hosting/processors and legal review.
- [ ] Full security, dependency, accessibility, performance and load reviews.
- [ ] Auditable privileged operations, suspension/moderation and plan enforcement.
- [ ] Deployment resources/cost/region approved; production provider credentials only through secure configuration.
- [ ] Backup/recovery documented using the platform's supported history/PITR/restore controls, with recovery exercise; no app-built backup jobs.
- [ ] Operational monitoring, incident response, support and release/rollback procedure.
- [ ] Explicit user authorization before publishing or activating any paid/external service.

## Expected future resource dependencies
Node frontend/API hosting and PostgreSQL; optional approved object storage for uploads; optional transactional email/SMS, payment processing, monitoring, domain and fiscal integration. Resources, provider costs and data processing terms must be evaluated before activation. No price, legal compliance, production scale or recovery guarantee is implied by Stage 1.
