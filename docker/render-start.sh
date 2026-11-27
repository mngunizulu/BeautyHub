#!/bin/sh
set -eu

: "${DATABASE_URL:?Set DATABASE_URL to the Render preview database URL}"
: "${CLERK_PUBLISHABLE_KEY:?Set CLERK_PUBLISHABLE_KEY}"
: "${CLERK_SECRET_KEY:?Set CLERK_SECRET_KEY}"
case "$CLERK_PUBLISHABLE_KEY:$CLERK_SECRET_KEY" in
  pk_test_*:sk_test_*) ;;
  *) echo "The Render preview requires Clerk development keys." >&2; exit 1 ;;
esac

NODE_ENV=development pnpm --filter @workspace/db migrate:dev
if [ "${BEAUTYHUB_PREVIEW_SEED:-0}" = 1 ]; then
  NODE_ENV=development pnpm --filter @workspace/db seed:dev
fi

exec node /workspace/artifacts/api-server/dist/index.mjs
