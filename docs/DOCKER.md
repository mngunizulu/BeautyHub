# Local Docker stack

Set `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in your shell or an untracked local `.env` using the matching keys from your Clerk development instance. The browser key is baked into the frontend. Rebuild the web image if it changes. Keep the secret at runtime only.

```sh
docker compose up --build -d
docker compose run --rm --no-deps migrate pnpm --filter @workspace/db run seed:dev
```

Open http://localhost:8080/salons. The seed command is optional and adds the fictional development catalog. The web port is bound to loopback by default and can be changed with `BEAUTYHUB_HTTP_PORT`. Check `/api/healthz` for database readiness.

The stack builds the existing Vite frontend and Express API into separate images. Nginx serves the frontend and forwards `/api` to the internal API, replacing forwarded headers at the ingress. PostgreSQL uses a named volume. A one-shot development migration service applies checked-in migrations before the API starts. `docker compose down` stops the stack and retains the database volume.

The Compose file is configured for local use with a fixed development database password. Public deployment requires a separate configuration for TLS, secrets, managed Clerk domains, database backup and reviewed migration execution.

## Versioned local images

Use the same Compose project and port for each build to retain the local database volume. Choose a new tag for each build you want to keep.

```powershell
$env:BEAUTYHUB_HTTP_PORT = '18082'
$env:BEAUTYHUB_IMAGE_TAG = 'v0.10.0'
docker compose --env-file .env -p beautyhub-local up --build -d
docker compose --env-file .env -p beautyhub-local images
```

The tag applies to the local web, API and migration images. Compose defaults to `dev` when the variable is unset. The existing Git remote and Docker image tags are managed independently.

## Render Free preview

Use a Docker Web Service linked to this Git repository and a separate Render PostgreSQL database in the same region. Use the repository root for the build context and set the Dockerfile path to `./Dockerfile.render`. Set the health check to `/api/healthz`. Leave Docker Command and Pre-Deploy Command empty. Start with Auto-Deploy off.

Set the following variables on the web service.

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Internal connection URL from the Render preview database. |
| `CLERK_PUBLISHABLE_KEY` | Clerk Development publishable key. |
| `VITE_CLERK_PUBLISHABLE_KEY` | The same Clerk Development publishable key. Render passes it into the frontend build. |
| `CLERK_SECRET_KEY` | Matching Clerk Development secret key. The image reads it at runtime. |
| `BEAUTYHUB_PREVIEW_SEED` | Optional. Set to `1` to load the fictional catalog. |

The preview container applies checked-in migrations to the configured database before opening its HTTP port. A migration failure stops startup. The preview serves the frontend and API together and leaves the local Compose and production deployment procedures in place. Use a dedicated preview database. The Render URL is internet-accessible.
