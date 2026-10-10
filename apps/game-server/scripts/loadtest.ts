/**
 * Load test: N concurrent matchmade games with random-move bots.
 *
 * Usage (server + redis + postgres running):
 *   GAME_SERVER_JWT_SECRET=... DATABASE_URL=... pnpm --filter @pawnstorm/game-server loadtest
 * Env knobs: LOAD_URL, LOAD_GAMES, LOAD_TC, LOAD_MAX_PLIES.
 *
 * Creates `loadtest-*` users, plays, prints moves/sec + latency percentiles,
 * then deletes all load-test data.
 */
import { performance } from "node:perf_hooks";
import { Chess } from "chess.js";
import { io, type Socket } from "socket.io-client";
import { prisma } from "@pawnstorm/db";
import type {
  ClientToServerEvents,
  GameOverPayload,
  GameStartPayload,
  MoveOkPayload,
  ServerToClientEvents,
} from "@pawnstorm/shared";
import { signSocketToken } from "../src/auth";

type Bot = Socket<ServerToClientEvents, ClientToServerEvents>;

const URL = process.env.LOAD_URL ?? "http://localhost:4000";
const GAMES = Number(process.env.LOAD_GAMES ?? 20);
const TC = (process.env.LOAD_TC ?? "10+0") as "1+0" | "3+2" | "5+3" | "10+0" | "15+10";
const MAX_PLIES = Number(process.env.LOAD_MAX_PLIES ?? 160);
const SECRET = process.env.GAME_SERVER_JWT_SECRET;

if (!SECRET) {
  console.error("GAME_SERVER_JWT_SECRET must be set");
  process.exit(1);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function playOneGame(index: number, latencies: number[]): Promise<number> {
  const tag = `loadtest-${process.pid}-${index}`;
  const users = await Promise.all(
    [0, 1].map((k) =>
      prisma.user.upsert({
        where: { username: `${tag}-${k}` },
        update: {},
        create: { username: `${tag}-${k}`, isGuest: true },
      }),
    ),
  );
  const sockets: Bot[] = users.map(
    (u) =>
      io(URL, {
        auth: {
          token: signSocketToken(
            { id: u.id, username: u.username, rating: u.rating, isGuest: true },
            SECRET as string,
            600,
          ),
        },
        reconnection: false,
      }) as unknown as Bot,
  );

  try {
    const startPromises = sockets.map(
      (s) =>
        new Promise<GameStartPayload>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("match timeout")), 30_000);
          s.once("game:start", (snap) => {
            clearTimeout(timer);
            resolve(snap);
          });
          s.once("connect_error", (err) => {
            clearTimeout(timer);
            reject(err);
          });
        }),
    );
    // Emit after listeners are attached.
    for (const s of sockets) s.emit("queue:join", { timeControl: TC });
    const snaps = await Promise.all(startPromises);
    const gameId = snaps[0].gameId;
    const byColor = new Map(snaps.map((snap, i) => [snap.color, sockets[i]]));
    const chess = new Chess();
    let moves = 0;

    const over = new Promise<GameOverPayload>((resolve) => {
      for (const s of sockets) s.once("game:over", resolve);
    });

    while (!chess.isGameOver() && moves < MAX_PLIES) {
      const mover = byColor.get(chess.turn()) as Bot;
      const options = chess.moves({ verbose: true });
      const pick = options[Math.floor(Math.random() * options.length)];
      const t0 = performance.now();
      const okP = new Promise<MoveOkPayload>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("move:ok timeout")), 10_000);
        mover.once("move:ok", (m) => {
          clearTimeout(timer);
          resolve(m);
        });
        mover.once("move:rejected", () => {
          clearTimeout(timer);
          reject(new Error("move rejected"));
        });
      });
      mover.emit("move", {
        gameId,
        from: pick.from,
        to: pick.to,
        ...(pick.promotion ? { promotion: pick.promotion as "q" | "r" | "b" | "n" } : {}),
      });
      await okP;
      latencies.push(performance.now() - t0);
      chess.move({ from: pick.from, to: pick.to, promotion: pick.promotion });
      moves++;
    }
    if (moves >= MAX_PLIES && !chess.isGameOver()) {
      const mover = byColor.get(chess.turn()) as Bot;
      mover.emit("resign", { gameId });
    }
    await over;
    return moves;
  } finally {
    for (const s of sockets) s.disconnect();
    await prisma.ratingHistory.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
    await prisma.game.deleteMany({
      where: { OR: [{ whiteId: { in: users.map((u) => u.id) } }, { blackId: { in: users.map((u) => u.id) } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  }
}

async function main(): Promise<void> {
  console.log(`Load test: ${GAMES} concurrent games vs ${URL} (${TC})`);
  const latencies: number[] = [];
  const t0 = performance.now();
  const results = await Promise.all(
    Array.from({ length: GAMES }, (_, i) => playOneGame(i, latencies)),
  );
  const elapsedSec = (performance.now() - t0) / 1000;
  const totalMoves = results.reduce((a, b) => a + b, 0);
  const sorted = [...latencies].sort((a, b) => a - b);
  console.log(`Games completed: ${results.length}`);
  console.log(`Total moves: ${totalMoves} in ${elapsedSec.toFixed(1)}s`);
  console.log(`Throughput: ${(totalMoves / elapsedSec).toFixed(1)} moves/sec`);
  console.log(
    `Move latency (emit→move:ok): p50=${percentile(sorted, 50).toFixed(1)}ms ` +
      `p95=${percentile(sorted, 95).toFixed(1)}ms p99=${percentile(sorted, 99).toFixed(1)}ms`,
  );
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
