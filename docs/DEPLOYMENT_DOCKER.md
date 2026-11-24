# Docker deployment

## Local development

Follow [local Docker setup](DOCKER.md) and copy `.env.example` to an ignored `.env`. For integration tests use an independent migrated and seeded PostgreSQL database in `DATABASE_URL`.

## Production-oriented configuration

Use an external PostgreSQL instance reachable only from the application host and authorized operators. Create a least-privilege runtime database role and a separate migration role. Set `DATABASE_URL`, matching Clerk keys, `BEAUTYHUB_IMAGE_TAG` and optionally `BEAUTYHUB_HTTP_PORT` in an ignored `.env.production`. Use TLS for database connections. The build incorporates only the public Clerk key.

Run these commands from the release checkout.

```sh
docker compose --env-file .env.production -f compose.production.yaml config --quiet
docker compose --env-file .env.production -f compose.production.yaml build
```

Back up the database and review pending SQL before migrating. With `MIGRATION_DATABASE_URL` set in the operator shell, build the release migration image and run Drizzle explicitly. Use the matching release tag when naming the migration image.

```sh
docker build --target database-tools -t beautyhub-migrations:2026-11-21.1 .
DATABASE_URL="$MIGRATION_DATABASE_URL" docker run --rm -e DATABASE_URL beautyhub-migrations:2026-11-21.1 pnpm --filter @workspace/db exec drizzle-kit migrate --config ./drizzle.config.ts
docker compose --env-file .env.production -f compose.production.yaml up -d --no-build --wait
curl --fail http://127.0.0.1:8080/api/healthz
docker compose --env-file .env.production -f compose.production.yaml logs --tail=100 api web
docker compose --env-file .env.production -f compose.production.yaml restart api web
```

Use a host reverse proxy to terminate TLS and forward the canonical Host header to the web port on loopback. Configure Clerk for the public domain. Keep PostgreSQL, the Node listener and the container web port off the public network. The release Compose file has no automatic migrations or seed job. Create optional fictional fixtures only on the development stack using the command in [local Docker setup](DOCKER.md).

## Backup, upgrade and rollback

Run backup commands from a secure operator session with a version-compatible PostgreSQL client. Restore first into a newly provisioned, isolated database. Check migrations and app readiness before redirecting traffic to a restored instance.

```sh
pg_dump --format=custom --file=beautyhub.dump "$BACKUP_DATABASE_URL"
pg_restore --exit-on-error --no-owner --dbname="$RESTORE_DATABASE_URL" beautyhub.dump
```

To upgrade, verify the backup and rehearse the migration against a restored copy. Build under a new immutable tag, migrate once, start using the updated release environment, and check both container health and a customer journey. For a failed application rollout with backward-compatible schema, restore the previous release tag and run the same `up -d --no-build --wait` command. If the schema is incompatible, review recovery with the database operator. Recover into a separate database and account for writes since the backup before switching.

Use the database provider's documented procedure for major PostgreSQL upgrades. Monitor health checks, error rates, database saturation and backups. Rotate database and Clerk secrets through the provider and recreate affected services. Rebuild the web image when the public Clerk key changes.

## Booking database requirements

Migration 0005 uses PostgreSQL's `btree_gist` extension to enforce overlapping employee and resource reservations, even when requests race. Confirm the migration role can install it or have the database operator install it before running the release migrations. Apply the later booking migrations before starting the updated API. The development booking flow stores only an opaque simulated payment reference and never captures card data or sends a payment.

## Transactional booking email

Local Compose uses capture mode. It saves each generated confirmation, reschedule, and cancellation as a JSON file in the project's private booking-email volume. The file contains the recipient, subject, HTML, plain text, and calendar attachment content. Use a local development account and inspect captures through the API container.

```powershell
docker compose -p beautyhub-local exec api ls -1 /app/booking-email
docker compose -p beautyhub-local exec api cat /app/booking-email/<event-id>.json
```

The worker retries failed deliveries with increasing delays and records a failed status after five attempts. Each queue row and capture is keyed by the booking event ID. Local captures can contain personal information such as recipient email and appointment details.

Deployments keep delivery off unless explicitly configured. To use an email gateway, set `BEAUTYHUB_BOOKING_EMAIL_MODE=http`, `BEAUTYHUB_BOOKING_EMAIL_APP_URL`, `BEAUTYHUB_BOOKING_EMAIL_ENDPOINT`, and `BEAUTYHUB_BOOKING_EMAIL_TOKEN` in the API environment. Both URLs must use HTTPS. The gateway receives JSON fields `to`, `subject`, `text`, `html`, and `calendar`. It must attach the last field as an ICS file and deduplicate successful requests using the `Idempotency-Key` header, including when a response is lost. It should return a successful status only after accepting delivery. Keep gateway credentials out of the repository.
