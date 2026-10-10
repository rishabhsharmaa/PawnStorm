# Production image for the authoritative game server. Built from the repo root
# (see docker-compose.prod.yml). Applies Prisma migrations on every boot.
FROM node:20-alpine
RUN apk add --no-cache openssl libc6-compat && corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json turbo.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/game-server/package.json apps/game-server/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN touch .env
RUN pnpm build
RUN chmod +x apps/game-server/docker-entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["apps/game-server/docker-entrypoint.sh"]
