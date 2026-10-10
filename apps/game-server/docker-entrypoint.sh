#!/bin/sh
# Container entrypoint: migrate the database, then start the game server.
set -e
echo "Applying database migrations..."
./node_modules/.bin/prisma migrate deploy --schema packages/db/prisma/schema.prisma
echo "Starting game server..."
exec node apps/game-server/dist/index.js
