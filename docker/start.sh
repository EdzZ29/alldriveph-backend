#!/bin/sh
set -e

# Pending migrations are applied by the app itself on start.
# The seed adds the first admin and starter content only where tables are still empty.
if [ "${RUN_SEED:-false}" = "true" ]; then
  node dist/cli/seed.js
fi

exec node dist/main.js
