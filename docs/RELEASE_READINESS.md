# Release readiness

**Stage 10 local development is complete. Production launch remains pending.**

| Release gate | Local evidence | Open before launch |
| --- | --- | --- |
| Identity and access | Clerk development sign-in, tenant and platform roles, invitation and revocation tests, and authenticated cross-tenant denial tests. | Verify the production Clerk instance, domains and session settings. |
| Booking and operations | PostgreSQL tests cover booking conflicts, rescheduling, inventory and payments. Signed-in desktop and mobile tests cover key customer and business journeys. | Run the complete release-candidate regression suite and verify production load and recovery. |
| Uploads | Gallery uploads validate file input and persist to development storage. | Verify production storage, access control and delivery. |
| Billing and fiscal workflows | Booking payments and business subscriptions support local simulation. | Approve any live provider and review TSE and DSFinV-K requirements before making fiscal claims. |
| Privacy and retention | Account export, request review and withdrawal, and erasure of eligible local synthetic accounts have regression coverage. | Approve retention and processor handling, then verify production erasure, including Clerk and backups. |
| Privileged operations | Administrator reviews, suspension, moderation and plan controls have automated local coverage. | Verify production administrator provisioning and audit access. |
| Application quality | Lint, type checking, build, 75 PostgreSQL tests and 14 browser cases pass. The production dependency audit reported zero advisories. Route splitting reduced the initial first-party JavaScript entry from 244.50 kB to 180.48 kB gzipped in local production builds. Desktop and mobile Chromium verified keyboard focus for the skip link and booking entry, plus Escape and focus return in mobile navigation. The booking calendar exposes full date labels, announces availability and preserves keyboard focus while searching. | Complete security, dependency, accessibility, and target-host performance and load reviews. |
| Deployment and recovery | A PostgreSQL 17 dump restored into a separate local database with 44 matching migration records, matching fixture counts and two exclusion constraints. The production Compose file validated with placeholders. The Docker runbook describes ingress, runtime roles and an explicit migration step. | Approve target resources, region and costs. Verify recovery and rollback on the intended host and configure monitoring and incident response. |

Publishing and activation of paid or live external services require explicit authorization. See [the test report](TEST_REPORT.md), [the handoff audit](HANDOFF_AUDIT.md) and [the Docker runbook](DEPLOYMENT_DOCKER.md).
