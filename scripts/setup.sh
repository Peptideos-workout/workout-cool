#!/bin/sh

_HERE="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"

if [ -n "${DATABASE_URL:-}" ]; then
  DATABASE_URL=$(printf '%s' "$DATABASE_URL" | node "$_HERE/normalize-database-url.js")
  export DATABASE_URL
fi

if [ -n "${DIRECT_DATABASE_URL:-}" ]; then
  DIRECT_DATABASE_URL=$(printf '%s' "$DIRECT_DATABASE_URL" | node "$_HERE/normalize-database-url.js")
  export DIRECT_DATABASE_URL
fi

# Transaction pool URIs (?pgbouncer=true) hang `prisma migrate deploy` — migrations must run against a normal Postgres/S session connection.
POOLER_TRANSACTION_MODE=""
if printf '%s' "${DATABASE_URL:-}" | grep -qiE 'pgbouncer[[:space:]]*=[[:space:]]*true'; then
  POOLER_TRANSACTION_MODE=1
fi

# Run migrate deploy with $DATABASE_URL for this invocation only (keeps pooled URL in the outer env for prisma generate / the app).
_migrate_deploy() {
  DATABASE_URL="$1" npx prisma migrate deploy
}

if [ "${FORCE_PRISMA_MIGRATE:-0}" = "1" ]; then
  echo "Running Prisma migrations (FORCE_PRISMA_MIGRATE=1)..."
  if [ -n "$POOLER_TRANSACTION_MODE" ] && [ -n "${DIRECT_DATABASE_URL:-}" ]; then
    _migrate_deploy "$DIRECT_DATABASE_URL" || echo "Warning: prisma migrate deploy failed via DIRECT_DATABASE_URL."
  elif [ -n "$POOLER_TRANSACTION_MODE" ]; then
    echo "FORCE_PRISMA_MIGRATE with pooled DATABASE_URL will hang unless you set DIRECT_DATABASE_URL." >&2
  else
    _migrate_deploy "${DATABASE_URL}" || echo "Warning: prisma migrate deploy failed."
  fi
elif [ "${SKIP_DB_MIGRATE:-0}" = "1" ]; then
  echo "Skipping Prisma migrations (SKIP_DB_MIGRATE=1)."
elif [ -n "$POOLER_TRANSACTION_MODE" ]; then
  if [ -n "${DIRECT_DATABASE_URL:-}" ]; then
    echo "Applying Prisma migrations via DIRECT_DATABASE_URL (runtime stays on pooled DATABASE_URL)..."
    _migrate_deploy "$DIRECT_DATABASE_URL" || echo "Warning: migrate failed — SSO/API will error until tables exist (check DIRECT_DATABASE_URL / network)."
  else
    echo "Skipping Prisma migrations: pooled DATABASE_URL (pgbouncer=true). Without DIRECT_DATABASE_URL, Prisma migrations cannot run in this container." >&2
    echo "  Add DIRECT_DATABASE_URL=postgresql://...@db.<project>.supabase.co:5432/postgres?sslmode=require then recreate — or once on Windows: set DATABASE_URL to that direct URI and run: npx prisma migrate deploy" >&2
  fi
else
  echo "Running Prisma migrations..."
  _migrate_deploy "${DATABASE_URL}" || echo "Warning: prisma migrate deploy failed."
fi

echo "Generating Prisma client..."
npx prisma generate

if [ "$SEED_SAMPLE_DATA" = "true"  ]; then
  echo "Seed sample data enabled, importing sample data..."
    # Import exercises if CSV exists
    if [ -f "./data/sample-exercises.csv" ]; then
        npx tsx scripts/import-exercises-with-attributes.ts ./data/sample-exercises.csv
    else
        echo "No exercises sample data found, skipping import."
    fi
else
  echo "Skipping sample data import."
fi

echo "Starting the app..."
exec "$@"  # runs the CMD from the Dockerfile
