# Decisions

Every assumption, trade-off, and deviation from the original spec, in chronological order.

## D1 — Build environment has no working shell (2026-10-10)

The agent session's shell sandbox failed on every command (`bwrap: loopback:
RTM_NEWADDR: Operation not permitted`) and unsandboxed execution requires human
approval, which was disabled. Consequences:

- `pnpm install`, builds, typechecks, lint, unit/integration/e2e tests, and the
  load test could **not** be executed by the agent. All code, configs, and tests
  were authored carefully but are **unverified in this session**.
- Phase commits could not be created. The working tree contains all phases;
  the user should review, run the gates, then commit.
- No `pnpm-lock.yaml` could be generated. `package.json` files use caret
  ranges on known-good major versions; the lockfile is created on first
  `pnpm install`.

First-run checklist for the user:

```bash
docker compose up -d && pnpm install && pnpm db:migrate && pnpm db:seed
pnpm typecheck && pnpm lint && pnpm test
pnpm dev
```

## D2 — `game:start` carries the full snapshot (rejoin included)

Instead of adding a separate rejoin-state event, `game:start` includes the full
snapshot (`moves`, `turn`, `lastMove`, `drawOfferBy`, `status`, `serverTime`,
`rejoined`). Both initial match and `rejoin` use it, so the client rebuilds
state from one message shape.

## D3 — `game:over` carries per-player rating blocks

The spec's `game:over {result, termination, ratingDelta}` is ambiguous about
whose delta it is. The payload is
`{gameId, result, termination, pgn, white: {…delta}, black: {…delta}}`; each
client reads its own delta. Same information, no per-socket personalization.

## D4 — `error` has an optional `gameId`

`error {code, message, gameId?}`. The optional `gameId` lets the client route
the user back to their live game on `ALREADY_IN_GAME`. Backwards compatible.

## D5 — CommonJS for server-side packages

`@pawnstorm/shared`, `@pawnstorm/db`, and the game server compile to CommonJS
so the game server has no ESM file-extension pitfalls and Next.js consumes the
built packages without `transpilePackages`. The web app itself uses Next.js
defaults (ESM).

## D6 — Guests are rated, but excluded from the leaderboard

Guests get real Elo updates so matchmaking stays fair if they keep playing,
but the leaderboard only lists registered users to avoid guest-name spam.

## D7 — Flag + insufficient material = draw

On timeout, if the position is dead (`chess.js` insufficient material), the
game is a draw; otherwise the flagger loses. No finer FIDE "possible series of
legal moves" analysis.

## D8 — Tick-based flag detection with Redis-claimed finalization

Flag detection runs on a 250ms ticker over locally-known active games rather
than one `setTimeout` per game (simpler lifecycle, survives event-loop stalls
more gracefully). Finalization is guarded by a short Redis `SETNX` lock so two
nodes can never finalize the same game twice.

## D9 — Matchmaking: 1s leader-swept pairing, atomic ZREM claim

Pairing runs on a 1s sweep (any node holding a short leader lock may sweep).
A pair is claimed with a single atomic `ZREM` (count must be 2; partial claims
are rolled back). No Lua scripts, so it works against `ioredis-mock` in tests.

## D10 — Stockfish loads from CDN inside the Web Worker

The engine worker loads the `stockfish.js` WASM build from jsDelivr via
`importScripts` at runtime instead of bundling ~7MB of WASM with the app.
Computer play and review require internet on first use; failure surfaces as a
friendly error, never a crash. The worker presets Emscripten's
`Module.locateFile` so the `.wasm` blob loads from the CDN too (otherwise it
404s against the app origin and the engine never answers). Self-hosting under
`public/engine/` is a one-line change (see `apps/web/workers/stockfish.worker.ts`).

## D11 — Sound effects via WebAudio, no assets

Move/capture/check/end sounds are synthesized with `OscillatorNode`. No binary
assets, mutable via the settings toggle.

## D12 — Minimal ESLint (typescript-eslint recommended only)

One root flat config, no framework-specific plugins, to keep the gate
deterministic. Next.js build still typechecks; accessibility is covered by
review + the keyboard move input, not by lint rules.

## D13 — Rating windows widen 50 pts / 5s up to 600

Matchmaking pairs within `min(600, 100 + 50 * floor(waitedSec / 5))`. Fast
matches for casual play; documented in `docs/architecture.md`.

## D14 — Computer games are casual and untimed

No clocks, no ratings for Stockfish games. Rated play is online-only, which
keeps the rating pool meaningful and the computer page simple.

## D15 — Flag in a dead position is scored as insufficient-material draw

Result `DRAW` with termination `INSUFFICIENT_MATERIAL` (rather than `TIMEOUT`)
when the flag falls in a position neither side can mate from.

## D16 — One root `.env`, loaded per-app with dotenv-cli

Each package's dev/migrate/seed script wraps with `dotenv -e ../../.env` so a
single root `.env` (copied from `.env.example`) feeds Next.js, the game
server, Prisma, and tsx. Production uses platform env vars; `start` scripts
take no dotenv dependency.

## D17 — Review verdict thresholds: 50 / 100 / 200 cp

Inaccuracy ≥50, mistake ≥100, blunder ≥200 centipawns of loss from the mover's
perspective (mates mapped to ±~10000). Documented in code (`lib/uci.ts`).

## D18 — E2E plays through the keyboard move input

The Playwright test drives games via the accessible move box rather than
board pixels, so it is deterministic across viewports and doubles as coverage
for keyboard play.

## D21 — No cleanup-cancel in the computer search effect

The engine search effect calls setStatus("thinking"), which re-renders and
re-runs the effect — so a conventional `cancelled` cleanup flag cancelled the
very search it started, dropping `bestmove` and wedging the UI on "thinking".
The effect returns no cleanup; staleness (new game mid-search) is handled by a
position check and unmount by a mounted ref. Covered by
`tests/e2e/computer.spec.ts` (browser-only bug class).

## D20 — Socket handlers serialized per user / per game

Socket.IO does not await async handlers, so a fast `queue:join` + `queue:leave`
pair interleaved Redis read-modify-write steps (leave's ZRANGE before join's
ZADD), leaving a phantom seeker that matched games it couldn't cancel — caught
by a flaky integration test. Queue handlers are now chained per user id and
move/resign/draw handlers per game id (same fix also closes double-submitted
moves). Cross-node races remain possible without sticky sessions (see scaling
notes), which is unchanged.

## D19 — Load test self-cleans

`scripts/loadtest.ts` creates `loadtest-*` users, plays, then deletes its
games, rating rows, and users, so repeated runs leave no residue.

## D22 — Production = single VPS, one origin, Caddy for TLS

The recommended deploy is one VPS running `docker-compose.prod.yml`
(postgres + redis + game-server + web + Caddy). Browsers use a single origin:
Caddy routes `/socket.io/*` to the game server and everything else to Next.js,
so `NEXT_PUBLIC_GAME_SERVER_URL` equals the public https origin and no second
subdomain/CORS setup is needed. Single replica per service keeps the sticky
session requirement trivially satisfied; the game-server entrypoint runs
`prisma migrate deploy` on every boot, and prod Postgres/Redis expose no host
ports. Managed hosting (Vercel + Railway/Render/Fly) stays documented as the
alternative.

## D23 — Idle matchmaking sweep gated for pay-per-command Redis

The 1s sweep ran unconditionally: leader lock + 5 queue scans + unlock = 8
commands/sec ≈ 690k/day idle, exhausting Upstash's 500k/month free quota in
under a day. The sweep now skips Redis unless a local socket is queued
(tracking cleared on match/leave/disconnect), plus a 5-min unconditional
backstop (~1.7k/day) for seekers orphaned by a crashed node. The Socket.IO
Redis adapter is env-gated (`ENABLE_REDIS_ADAPTER`, default off) since it is
pure overhead on one node.

## D24 — Boot recovery resumes live games, downtime forgiven

`resumeActiveGames` (called from `index.ts`) SCANs `game:*` on boot, shifts
suspended games past their downtime (crashes: `lastMoveAt = now`), and
re-registers them in `activeGames` so the flag ticker and rejoin work after a
restart — free-tier hosts restart, and an outage is the server's fault, not
the players'. Disconnect grace timers still do not survive restarts: a player
mid-grace when the server dies keeps their game and resolves via clocks.

## D25 — Prisma engines for Vercel: rhel target + monorepo plugin

Production on Vercel failed every DB route: only the `native` engine was
generated, but the Vercel runtime needs `rhel-openssl-3.0.x`, and the pnpm
virtual-store layout hides the engine from Next's file tracer. Fix:
`binaryTargets = ["native", "rhel-openssl-3.0.x"]`,
`@prisma/nextjs-monorepo-workaround-plugin` in the web webpack config
(server builds only), and `postinstall: prisma generate` in `@pawnstorm/db`
so a clean install always generates before `next build`. The game server on
Render needs no change (it builds and runs on the same image, so `native`
covers it, and its build already runs the db build). `outputFileTracingRoot`/
`outputFileTracingIncludes` were held back pending evidence — and the
Vercel-sequence build proved them unnecessary: the plugin copies
`libquery_engine-rhel-openssl-3.0.x.so.node` into `.next/server/chunks` and
every server route's `.nft.json` references it.
