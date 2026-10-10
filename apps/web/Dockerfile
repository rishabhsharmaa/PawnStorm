# Production image for the Next.js web app. Built from the repo root
# (see docker-compose.prod.yml). NEXT_PUBLIC_* vars bake in at build time.
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
# Dev scripts wrap commands with dotenv -e ../../.env; an empty file keeps
# that wrapper happy while real values come from the environment/build args.
RUN touch .env
ARG NEXT_PUBLIC_GAME_SERVER_URL
ENV NEXT_PUBLIC_GAME_SERVER_URL=${NEXT_PUBLIC_GAME_SERVER_URL}
RUN pnpm build

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
