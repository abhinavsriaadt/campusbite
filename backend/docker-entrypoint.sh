#!/bin/sh
set -e

echo "[entrypoint] Applying database migrations..."
alembic upgrade head

if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
  echo "[entrypoint] Seeding demo data (idempotent)..."
  python -m app.seed
fi

exec "$@"
