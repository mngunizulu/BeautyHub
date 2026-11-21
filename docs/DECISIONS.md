# Decisions

## ADR-001 — Preserve the pnpm TypeScript modular-monolith starter
**Decision:** React/Vite/Tailwind/TanStack Query frontend; Express 5 backend; PostgreSQL/Drizzle; OpenAPI-first generated clients and validators.
**Why:** Fits the supplied starter and portable product requirements without unnecessary infrastructure or rewriting valid work.
**Alternatives:** Nest/Prisma or microservices add migration/setup cost without a Stage 1 benefit.
**Consequences:** Keep routes, data access and domain policies separate; use shared libraries rather than importing between apps.

## ADR-002 — Stage 1 provides honest authentication foundations, not fake sign-in
**Decision:** Planned managed Clerk, internal identity/membership schema, pure permission policies and unconditional 401 on private namespaces until Stage 2.
**Why:** The brief separates foundations from real account/onboarding flows. Provider status is not configured; no services, fees or password handling should be assumed.
**Alternatives:** Local passwords/ad hoc tokens introduce unnecessary credential risk; trusting a demo user or client headers would make tenant protections misleading.
**Consequences:** No Stage 1 account creation/login. Stage 2 must integrate managed identity before making any private operation accessible, then test authenticated cross-tenant authorization.

## ADR-003 — A narrow, persisted, read-only public catalog proves the foundation
**Decision:** Three visibly fictional Berlin studios, nine categories, nine services and hours are stored in PostgreSQL; filters, details and counts query actual data.
**Why:** The user explicitly rejects disconnected mocks or documentation-only delivery. A small public slice proves frontend/API/database integration without implementing the booking engine early.
**Alternatives:** Static frontend arrays would not prove persistence; a fabricated business dashboard would imply operations not yet implemented.
**Consequences:** No fake reviews/availability/favorites/bookings/payments. Stage 3 still owns full search/filter/profile/favorites scope.

## ADR-004 — Versioned development migrations, no startup production DDL
**Decision:** Check Drizzle migration SQL and metadata into source, explicitly apply only to development. Replit's managed Publish flow owns future production schema.
**Why:** Preserves repeatability and matches the documented managed-database lifecycle. Production operations require approval.
**Consequences:** Seed/migrate commands are development guarded, never called on API startup. No publication has been authorized.

## ADR-005 — Private salon records require explicit membership
**Decision:** Platform administrator status does not implicitly authorize access to salon-private CRM records.
**Why:** Global operations and tenant-private records have different privacy boundaries; least privilege avoids accidental broad access.
**Consequences:** Future support access needs explicit, separately designed and audited permissions. Stage 2 loads roles only from trusted persisted data.

## ADR-006 — Managed identity and independent persisted memberships
**Decision:** Stage 2 activates managed Clerk without local passwords; identities bridge uniquely into PostgreSQL. Roles are independent per organization, checked on every request. Platform admin remains separately trusted, never an owner sign-up option. Only owners grant/revoke memberships and publish.
**Why:** One consumer can work with multiple unrelated businesses without gaining another tenant's rights. Deactivations must take effect on subsequent requests.
**Consequences:** No client-provided identity/role is trusted. Provider owns recovery and verified email; local profile/preferences remain editable.

## ADR-007 — Explicit invitation and financial limits
**Decision:** Hash expiring invitation tokens, verify intended email and current issuer permissions, consume atomically once; manually share fragment links because no email provider was approved. Soft archive services/variants, version policies immutably and model only opaque payment references.
**Why:** Safe membership creation and future price/policy snapshots are needed now; real booking, card authorization, fee collection and enforceability are not authorized or ready.
**Consequences:** No raw token persistence/logging, card-entry form, payment credential or real-money action. Future SetupIntent/off-session/BookingItem contracts are documented in architecture; actual functionality stays in later stages.
