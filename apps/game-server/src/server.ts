import { createServer, type Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Server, type Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Chess } from "chess.js";
import {
  DISCONNECT_GRACE_MS,
  FINISHED_GAME_TTL_SECONDS,
  TIME_CONTROL_IDS,
  applyClockTick,
  calculateElo,
  gameIdPayloadSchema,
  moveSchema,
  parseTimeControl,
  queueJoinSchema,
  queueLeaveSchema,
  type ClientToServerEvents,
  type ErrorPayload,
  type GameOverPayload,
  type GameResult,
  type GameStartPayload,
  type ServerToClientEvents,
  type Termination,
  type TimeControlId,
} from "@pawnstorm/shared";
import type { Logger } from "pino";
import { verifySocketToken } from "./auth";
import { applyMove, buildPgn, flagResult } from "./chess";
import { type GameStore } from "./store";
import {
  gameRoom,
  keys,
  loadGame,
  saveGame,
  userRoom,
  type RedisClient,
} from "./redis";
import {
  claimPair,
  dequeueFromAll,
  enqueue,
  findOpponent,
  listSeekers,
  type Seeker,
} from "./matchmaking";
import { TokenBucket, SlidingWindow } from "./ratelimit";
import type { FinishedGameSummary, GameState, SocketData } from "./types";
import { createLogger } from "./logger";

export type GameSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export interface ServerDeps {
  redis: RedisClient;
  pubClient?: RedisClient;
  subClient?: RedisClient;
  store: GameStore;
  jwtSecret: string;
  webOrigin: string;
  graceMs?: number;
  clockTickMs?: number;
  matchSweepMs?: number;
  nodeId?: string;
  logger?: Logger;
}

export interface GameServerHandle {
  httpServer: HttpServer;
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
  redis: RedisClient;
  store: GameStore;
  activeGames: Set<string>;
  finalizeGame: (gameId: string, result: GameResult, termination: Termination) => Promise<void>;
  sweepMatchmaking: () => Promise<void>;
  close: () => Promise<void>;
}

/** Stale "current game" pointers expire even if a node crashes mid-game. */
const USER_GAME_TTL_SECONDS = 6 * 60 * 60;
/**
 * Unconditional backstop sweep interval. The fast sweep only touches Redis
 * while a local socket is queued (pay-per-command tiers would otherwise burn
 * quota polling empty queues); the backstop still pairs seekers orphaned by a
 * crashed node within minutes.
 */
const MATCH_BACKSTOP_MS = 5 * 60 * 1000;

function emitError(socket: GameSocket, code: string, message: string, gameId?: string): void {
  const payload: ErrorPayload = gameId ? { code, message, gameId } : { code, message };
  socket.emit("error", payload);
}

export function toSnapshot(state: GameState, color: "w" | "b"): GameStartPayload {
  const opponent = color === "w" ? state.black : state.white;
  const last = state.moves[state.moves.length - 1];
  return {
    gameId: state.id,
    color,
    fen: state.fen,
    clocks: { whiteMs: state.whiteMs, blackMs: state.blackMs },
    opponent: { id: opponent.id, username: opponent.username, rating: opponent.rating },
    timeControl: state.timeControl,
    turn: state.turn,
    moves: state.moves,
    lastMove: last ? { from: last.from, to: last.to } : null,
    drawOfferBy: state.drawOfferBy,
    status: state.status,
    serverTime: Date.now(),
    rejoined: true,
  };
}

function endTuple(end: { result: GameResult; termination: Termination }): [GameResult, Termination] {
  return [end.result, end.termination];
}

/**
 * Per-key promise chain serializing async socket handlers. Socket.IO does not
 * await async handlers, so without this a fast queue:join + queue:leave (or a
 * double-submitted move) can interleave Redis read-modify-write steps: e.g.
 * leave's ZRANGE lands before join's ZADD and a phantom seeker matches a game
 * it can never cancel. Keys are user ids (queue ops) or game ids (game ops).
 */
function createOpChain() {
  const chains = new Map<string, Promise<unknown>>();
  return function chainOp<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = chains.get(key) ?? Promise.resolve();
    const task = prev.catch(() => undefined).then(fn);
    const stored: Promise<unknown> = task.then(
      () => undefined,
      () => undefined,
    );
    chains.set(key, stored);
    void stored.finally(() => {
      if (chains.get(key) === stored) chains.delete(key);
    });
    return task;
  };
}

/** Best-effort routing key so per-game handlers serialize on game id. */
function gameRouteKey(raw: unknown, socketId: string): string {
  if (
    typeof raw === "object" &&
    raw !== null &&
    typeof (raw as { gameId?: unknown }).gameId === "string"
  ) {
    return (raw as { gameId: string }).gameId;
  }
  return `invalid:${socketId}:${Date.now()}:${Math.random()}`;
}

/**
 * Boot recovery: re-register every live game in Redis so the flag ticker and
 * rejoin keep working after a restart. Downtime is forgiven — graceful
 * shutdowns via suspendedAt (same math as loadGame), crashes by resetting
 * lastMoveAt — because an outage is the server's fault, not the players'.
 * Runs once at boot, so its handful of SCAN/GET/SET calls costs nothing even
 * on pay-per-command Redis tiers. Returns the number of resumed games.
 */
export async function resumeActiveGames(
  redis: RedisClient,
  activeGames: Set<string>,
  logger: Logger,
): Promise<number> {
  let resumed = 0;
  let cursor = "0";
  do {
    const [next, foundKeys] = await redis.scan(cursor, "MATCH", "game:*", "COUNT", 100);
    // ioredis returns the cursor as a string, ioredis-mock as a number —
    // normalize so the loop terminates (and never double-counts) on both.
    cursor = String(next);
    for (const key of foundKeys) {
      if (key.endsWith(":result")) continue;
      const id = key.slice("game:".length);
      if (!id || id.includes(":")) continue;
      try {
        const raw = await redis.get(key);
        if (!raw) continue;
        const state = JSON.parse(raw) as GameState;
        if (!state || state.id !== id || typeof state.fen !== "string") continue;
        if (state.status !== "playing") continue;
        if (state.suspendedAt) {
          const downtime = Date.now() - state.suspendedAt;
          if (downtime > 0) state.lastMoveAt += downtime;
        } else {
          state.lastMoveAt = Date.now();
        }
        state.suspendedAt = null;
        await saveGame(redis, state);
        activeGames.add(id);
        resumed += 1;
      } catch (err) {
        logger.error({ err, key }, "failed to resume game");
      }
    }
  } while (cursor !== "0");
  return resumed;
}

export function createGameServer(deps: ServerDeps): GameServerHandle {
  const nodeId = deps.nodeId ?? randomUUID().slice(0, 8);
  const logger = deps.logger ?? createLogger("info", nodeId);
  const graceMs = deps.graceMs ?? DISCONNECT_GRACE_MS;
  const clockTickMs = deps.clockTickMs ?? 250;
  const matchSweepMs = deps.matchSweepMs ?? 1000;
  const activeGames = new Set<string>();
  const graceTimers = new Map<string, NodeJS.Timeout>();
  const userSockets = new Map<string, Set<string>>();
  const queuedSockets = new Set<string>();
  let lastSweepAt = 0;
  const chainQueueOp = createOpChain();
  const chainGameOp = createOpChain();
  let closing = false;
  const startedAt = Date.now();

  const httpServer = createServer((req, res) => {
    if (req.url?.startsWith("/socket.io/")) return; // handled by engine.io
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          status: closing ? "draining" : "ok",
          nodeId,
          uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
          activeGames: activeGames.size,
        }),
      );
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, { cors: { origin: deps.webOrigin } });

  if (deps.pubClient && deps.subClient) {
    io.adapter(createAdapter(deps.pubClient, deps.subClient));
  }

  const ipLimiter = new SlidingWindow(120, 60_000);

  io.use((socket, next) => {
    if (closing) return next(new Error("server is shutting down"));
    if (!ipLimiter.allow(socket.handshake.address)) {
      return next(new Error("rate limited, try again soon"));
    }
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token !== "string" || token.length === 0) {
      return next(new Error("missing auth token"));
    }
    try {
      const user = verifySocketToken(token, deps.jwtSecret);
      socket.data.user = user;
      socket.data.queuedIn = [];
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  function colorOf(state: GameState, userId: string): "w" | "b" | null {
    if (state.white.id === userId) return "w";
    if (state.black.id === userId) return "b";
    return null;
  }

  function clearGrace(userId: string): boolean {
    const timer = graceTimers.get(userId);
    if (!timer) return false;
    clearTimeout(timer);
    graceTimers.delete(userId);
    return true;
  }

  async function finalizeGame(
    gameId: string,
    result: GameResult,
    termination: Termination,
  ): Promise<void> {
    // Short cross-node lock: only one finalizer wins.
    const lockKey = keys.finalizeLock(gameId);
    const acquired = await deps.redis.setnx(lockKey, nodeId);
    if (!acquired) return;
    await deps.redis.pexpire(lockKey, 10_000);
    try {
      const state = await loadGame(deps.redis, gameId);
      if (!state || state.status === "finished") return;
      state.status = "finished";
      state.result = result;
      state.termination = termination;

      const pgn = buildPgn(state);
      const elo = calculateElo(state.whiteRatingBefore, state.blackRatingBefore, result);
      await deps.store.saveFinishedGame({
        id: state.id,
        whiteId: state.white.id,
        blackId: state.black.id,
        pgn,
        result,
        termination,
        timeControl: state.timeControl,
        whiteBefore: state.whiteRatingBefore,
        blackBefore: state.blackRatingBefore,
        whiteAfter: elo.whiteAfter,
        blackAfter: elo.blackAfter,
        startedAt: new Date(state.startedAt),
        endedAt: new Date(),
      });

      const payload: GameOverPayload = {
        gameId: state.id,
        result,
        termination,
        pgn,
        white: {
          id: state.white.id,
          username: state.white.username,
          ratingBefore: state.whiteRatingBefore,
          ratingAfter: elo.whiteAfter,
          delta: elo.whiteDelta,
        },
        black: {
          id: state.black.id,
          username: state.black.username,
          ratingBefore: state.blackRatingBefore,
          ratingAfter: elo.blackAfter,
          delta: elo.blackDelta,
        },
      };
      const summary: FinishedGameSummary = payload;
      await deps.redis.set(keys.gameResult(gameId), JSON.stringify(summary));
      await deps.redis.expire(keys.gameResult(gameId), FINISHED_GAME_TTL_SECONDS);
      await deps.redis.del(keys.game(gameId));
      await deps.redis.del(keys.userGame(state.white.id));
      await deps.redis.del(keys.userGame(state.black.id));
      activeGames.delete(gameId);
      clearGrace(state.white.id);
      clearGrace(state.black.id);

      io.to(gameRoom(gameId)).emit("game:over", payload);
      logger.info({ gameId, result, termination }, "game finalized");
    } finally {
      await deps.redis.del(lockKey);
    }
  }

  async function startMatchedGame(timeControl: TimeControlId, a: Seeker, b: Seeker): Promise<void> {
    const [userA, userB] = await Promise.all([
      deps.store.getUser(a.userId),
      deps.store.getUser(b.userId),
    ]);
    const now = Date.now();
    if (!userA || !userB) {
      // One side vanished from the DB; requeue the survivor.
      if (userA) await enqueue(deps.redis, timeControl, { ...a, joinedAt: now });
      if (userB) await enqueue(deps.redis, timeControl, { ...b, joinedAt: now });
      logger.warn({ a: a.userId, b: b.userId }, "matched user missing from store, requeued survivor");
      return;
    }
    const tc = parseTimeControl(timeControl);
    const whiteFirst = Math.random() < 0.5;
    const white = whiteFirst ? userA : userB;
    const black = whiteFirst ? userB : userA;
    const state: GameState = {
      id: randomUUID(),
      white: { id: white.id, username: white.username, rating: white.rating, isGuest: white.isGuest },
      black: { id: black.id, username: black.username, rating: black.rating, isGuest: black.isGuest },
      whiteRatingBefore: white.rating,
      blackRatingBefore: black.rating,
      fen: new Chess().fen(),
      moves: [],
      turn: "w",
      whiteMs: tc.baseMs,
      blackMs: tc.baseMs,
      incrementMs: tc.incrementMs,
      lastMoveAt: now,
      status: "playing",
      drawOfferBy: null,
      timeControl,
      startedAt: now,
      suspendedAt: null,
      result: null,
      termination: null,
    };
    await saveGame(deps.redis, state);
    for (const player of [white, black]) {
      await deps.redis.set(keys.userGame(player.id), state.id);
      await deps.redis.expire(keys.userGame(player.id), USER_GAME_TTL_SECONDS);
    }
    activeGames.add(state.id);
    // Remote-capable join: works across nodes via the Redis adapter.
    await io.in(userRoom(white.id)).socketsJoin(gameRoom(state.id));
    await io.in(userRoom(black.id)).socketsJoin(gameRoom(state.id));
    io.to(userRoom(white.id)).emit("game:start", { ...toSnapshot(state, "w"), rejoined: false });
    io.to(userRoom(black.id)).emit("game:start", { ...toSnapshot(state, "b"), rejoined: false });
    // Matched players are no longer seeking: clear local queue tracking so the
    // sweep idle-gate closes (their entries were already claimed from Redis).
    for (const userId of [white.id, black.id]) {
      try {
        const sockets = await io.in(userRoom(userId)).fetchSockets();
        for (const s of sockets) {
          s.data.queuedIn = [];
          queuedSockets.delete(s.id);
        }
      } catch (err) {
        logger.error({ err, userId }, "failed to clear queue tracking after match");
      }
    }
    logger.info(
      { gameId: state.id, white: white.id, black: black.id, timeControl },
      "game started",
    );
  }

  async function sweepMatchmaking(): Promise<void> {
    if (closing) return;
    const leader = await deps.redis.setnx(keys.matchLeader, nodeId);
    if (!leader) return;
    await deps.redis.pexpire(keys.matchLeader, 3000);
    try {
      for (const tc of TIME_CONTROL_IDS) {
        const seekers = await listSeekers(deps.redis, tc);
        if (seekers.length < 2) continue;
        const unmatched = new Map(seekers.map((s) => [s.userId, s]));
        const now = Date.now();
        for (const me of seekers) {
          if (!unmatched.has(me.userId)) continue;
          const opp = findOpponent([...unmatched.values()], me, now);
          if (!opp) continue;
          unmatched.delete(me.userId);
          unmatched.delete(opp.userId);
          try {
            const claimed = await claimPair(deps.redis, tc, me, opp);
            if (claimed) await startMatchedGame(tc, me, opp);
          } catch (err) {
            logger.error({ err, tc }, "match start failed");
          }
        }
      }
    } finally {
      await deps.redis.del(keys.matchLeader);
    }
  }

  async function runSweep(): Promise<void> {
    lastSweepAt = Date.now();
    await sweepMatchmaking();
  }

  io.on("connection", (socket: GameSocket) => {
    const user = socket.data.user;
    logger.info({ userId: user.id, socketId: socket.id }, "socket connected");
    void socket.join(userRoom(user.id));
    let sockets = userSockets.get(user.id);
    if (!sockets) {
      sockets = new Set();
      userSockets.set(user.id, sockets);
    }
    sockets.add(socket.id);
    const bucket = new TokenBucket(30, 10);

    function limited(): boolean {
      if (bucket.take()) return false;
      emitError(socket, "RATE_LIMITED", "too many requests, slow down");
      return true;
    }

    socket.on("queue:join", (raw) => {
      void chainQueueOp(user.id, async () => {
        if (limited()) return;
        const parsed = queueJoinSchema.safeParse(raw);
        if (!parsed.success) {
          emitError(socket, "INVALID_PAYLOAD", "malformed queue:join payload");
          return;
        }
        if (closing) {
          emitError(socket, "SERVER_DRAINING", "server is shutting down, try again soon");
          return;
        }
        const current = await deps.redis.get(keys.userGame(user.id));
        if (current) {
          emitError(socket, "ALREADY_IN_GAME", "finish your current game first", current);
          return;
        }
        const tc = parsed.data.timeControl;
        await enqueue(deps.redis, tc, { userId: user.id, rating: user.rating, joinedAt: Date.now() });
        if (!socket.data.queuedIn.includes(tc)) socket.data.queuedIn.push(tc);
        queuedSockets.add(socket.id);
        // Try an immediate match so a waiting opponent pairs in ms.
        runSweep().catch((err: unknown) => logger.error({ err }, "sweep failed"));
      }).catch((err: unknown) => {
        logger.error({ err, userId: user.id }, "queue:join failed");
        emitError(socket, "INTERNAL", "matchmaking failed, try again");
      });
    });

    socket.on("queue:leave", (raw) => {
      void chainQueueOp(user.id, async () => {
        if (limited()) return;
        if (!queueLeaveSchema.safeParse(raw).success) {
          emitError(socket, "INVALID_PAYLOAD", "malformed queue:leave payload");
          return;
        }
        await dequeueFromAll(deps.redis, socket.data.queuedIn, user.id);
        socket.data.queuedIn = [];
        queuedSockets.delete(socket.id);
      }).catch((err: unknown) => {
        logger.error({ err, userId: user.id }, "queue:leave failed");
      });
    });

    socket.on("move", (raw) => {
      void chainGameOp(gameRouteKey(raw, socket.id), async () => {
        if (limited()) return;
        const parsed = moveSchema.safeParse(raw);
        if (!parsed.success) {
          emitError(socket, "INVALID_PAYLOAD", "malformed move payload");
          return;
        }
        const { gameId, from, to, promotion } = parsed.data;
        const state = await loadGame(deps.redis, gameId);
        if (!state) {
          emitError(socket, "GAME_NOT_FOUND", "unknown or finished game", gameId);
          return;
        }
        const color = colorOf(state, user.id);
        if (!color) {
          emitError(socket, "NOT_IN_GAME", "you are not a player in this game", gameId);
          return;
        }
        if (color !== state.turn) {
          socket.emit("move:rejected", { gameId, reason: "not your turn", fen: state.fen });
          return;
        }
        const outcome = applyMove(state, { from, to, promotion }, Date.now());
        if (!outcome.ok) {
          if ("flagged" in outcome) {
            await finalizeGame(gameId, ...endTuple(flagResult(state.fen, outcome.flagged)));
            return;
          }
          socket.emit("move:rejected", { gameId, reason: outcome.reason, fen: state.fen });
          return;
        }
        await saveGame(deps.redis, state);
        activeGames.add(gameId);
        const last = state.moves[state.moves.length - 1];
        io.to(gameRoom(gameId)).emit("move:ok", {
          gameId,
          san: outcome.san,
          fen: state.fen,
          clocks: { whiteMs: state.whiteMs, blackMs: state.blackMs },
          ply: state.moves.length,
          turn: state.turn,
          lastMove: { from: last.from, to: last.to },
          serverTime: Date.now(),
        });
        if (outcome.end) {
          await finalizeGame(gameId, outcome.end.result, outcome.end.termination);
        }
      }).catch((err: unknown) => {
        logger.error({ err, userId: user.id }, "move handler failed");
        emitError(socket, "INTERNAL", "move failed, try again");
      });
    });

    socket.on("resign", (raw) => {
      void chainGameOp(gameRouteKey(raw, socket.id), async () => {
        if (limited()) return;
        const parsed = gameIdPayloadSchema.safeParse(raw);
        if (!parsed.success) {
          emitError(socket, "INVALID_PAYLOAD", "malformed resign payload");
          return;
        }
        const { gameId } = parsed.data;
        const state = await loadGame(deps.redis, gameId);
        if (!state || state.status !== "playing") {
          emitError(socket, "GAME_NOT_FOUND", "unknown or finished game", gameId);
          return;
        }
        const color = colorOf(state, user.id);
        if (!color) {
          emitError(socket, "NOT_IN_GAME", "you are not a player in this game", gameId);
          return;
        }
        await finalizeGame(gameId, color === "w" ? "BLACK_WIN" : "WHITE_WIN", "RESIGN");
      }).catch((err: unknown) => {
        logger.error({ err, userId: user.id }, "resign handler failed");
        emitError(socket, "INTERNAL", "resign failed, try again");
      });
    });

    socket.on("draw:offer", (raw) => {
      void chainGameOp(gameRouteKey(raw, socket.id), async () => {
        if (limited()) return;
        const parsed = gameIdPayloadSchema.safeParse(raw);
        if (!parsed.success) {
          emitError(socket, "INVALID_PAYLOAD", "malformed draw offer");
          return;
        }
        const { gameId } = parsed.data;
        const state = await loadGame(deps.redis, gameId);
        if (!state || state.status !== "playing") {
          emitError(socket, "GAME_NOT_FOUND", "unknown or finished game", gameId);
          return;
        }
        const color = colorOf(state, user.id);
        if (!color) {
          emitError(socket, "NOT_IN_GAME", "you are not a player in this game", gameId);
          return;
        }
        if (state.drawOfferBy === color) return; // idempotent
        state.drawOfferBy = color;
        await saveGame(deps.redis, state);
        socket.to(gameRoom(gameId)).emit("draw:offered", { gameId, by: user.username });
      }).catch((err: unknown) => {
        logger.error({ err, userId: user.id }, "draw:offer failed");
        emitError(socket, "INTERNAL", "draw offer failed, try again");
      });
    });

    socket.on("draw:accept", (raw) => {
      void chainGameOp(gameRouteKey(raw, socket.id), async () => {
        if (limited()) return;
        const parsed = gameIdPayloadSchema.safeParse(raw);
        if (!parsed.success) {
          emitError(socket, "INVALID_PAYLOAD", "malformed draw accept");
          return;
        }
        const { gameId } = parsed.data;
        const state = await loadGame(deps.redis, gameId);
        if (!state || state.status !== "playing") {
          emitError(socket, "GAME_NOT_FOUND", "unknown or finished game", gameId);
          return;
        }
        const color = colorOf(state, user.id);
        if (!color) {
          emitError(socket, "NOT_IN_GAME", "you are not a player in this game", gameId);
          return;
        }
        if (!state.drawOfferBy || state.drawOfferBy === color) return; // nothing to accept
        await finalizeGame(gameId, "DRAW", "AGREEMENT");
      }).catch((err: unknown) => {
        logger.error({ err, userId: user.id }, "draw:accept failed");
        emitError(socket, "INTERNAL", "draw accept failed, try again");
      });
    });

    socket.on("draw:decline", (raw) => {
      void chainGameOp(gameRouteKey(raw, socket.id), async () => {
        if (limited()) return;
        const parsed = gameIdPayloadSchema.safeParse(raw);
        if (!parsed.success) {
          emitError(socket, "INVALID_PAYLOAD", "malformed draw decline");
          return;
        }
        const { gameId } = parsed.data;
        const state = await loadGame(deps.redis, gameId);
        if (!state || state.status !== "playing") return; // idempotent
        const color = colorOf(state, user.id);
        if (!color) return;
        if (!state.drawOfferBy || state.drawOfferBy === color) return; // nothing to decline
        state.drawOfferBy = null;
        await saveGame(deps.redis, state);
        socket.to(gameRoom(gameId)).emit("draw:declined", { gameId });
      }).catch((err: unknown) => {
        logger.error({ err, userId: user.id }, "draw:decline failed");
      });
    });

    socket.on("rejoin", (raw) => {
      void (async () => {
        if (limited()) return;
        const parsed = gameIdPayloadSchema.safeParse(raw);
        if (!parsed.success) {
          emitError(socket, "INVALID_PAYLOAD", "malformed rejoin payload");
          return;
        }
        const { gameId } = parsed.data;
        const state = await loadGame(deps.redis, gameId);
        if (!state) {
          const finished = await deps.redis.get(keys.gameResult(gameId));
          if (finished) {
            try {
              socket.emit("game:over", JSON.parse(finished) as GameOverPayload);
            } catch {
              emitError(socket, "INTERNAL", "could not load finished game", gameId);
            }
            return;
          }
          emitError(socket, "GAME_NOT_FOUND", "unknown game (finished games expire after 24h)", gameId);
          return;
        }
        const color = colorOf(state, user.id);
        if (!color) {
          emitError(socket, "NOT_IN_GAME", "you are not a player in this game", gameId);
          return;
        }
        await chainQueueOp(user.id, () =>
          dequeueFromAll(deps.redis, socket.data.queuedIn, user.id),
        );
        socket.data.queuedIn = [];
        await socket.join(gameRoom(gameId));
        if (state.status === "playing") activeGames.add(gameId);
        const wasAway = clearGrace(user.id);
        socket.emit("game:start", toSnapshot(state, color));
        if (wasAway) socket.to(gameRoom(gameId)).emit("opponent:reconnected", { gameId });
      })().catch((err: unknown) => {
        logger.error({ err, userId: user.id }, "rejoin failed");
        emitError(socket, "INTERNAL", "rejoin failed, try again");
      });
    });

    socket.on("disconnect", () => {
      queuedSockets.delete(socket.id);
      const set = userSockets.get(user.id);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) userSockets.delete(user.id);
      }
      logger.info({ userId: user.id, socketId: socket.id }, "socket disconnected");
      void (async () => {
        try {
          await chainQueueOp(user.id, () =>
            dequeueFromAll(deps.redis, socket.data.queuedIn, user.id),
          );
          if (closing) return;
          if (userSockets.has(user.id)) return; // another tab still connected
          const gameId = await deps.redis.get(keys.userGame(user.id));
          if (!gameId) return;
          const state = await loadGame(deps.redis, gameId);
          if (!state || state.status !== "playing") return;
          io.to(gameRoom(gameId)).emit("opponent:disconnected", { gameId, graceMs });
          const timer = setTimeout(() => {
            graceTimers.delete(user.id);
            void (async () => {
              try {
                const current = await loadGame(deps.redis, gameId);
                if (!current || current.status !== "playing") return;
                const color = colorOf(current, user.id);
                if (!color) return;
                await finalizeGame(
                  gameId,
                  color === "w" ? "BLACK_WIN" : "WHITE_WIN",
                  "ABANDONED",
                );
              } catch (err) {
                logger.error({ err, gameId }, "forfeit failed");
              }
            })();
          }, graceMs);
          timer.unref?.();
          graceTimers.set(user.id, timer);
        } catch (err) {
          logger.error({ err, userId: user.id }, "disconnect cleanup failed");
        }
      })();
    });
  });

  // Flag ticker: ends games whose side to move ran out of time.
  const clockTimer = setInterval(() => {
    if (activeGames.size === 0) return;
    void (async () => {
      const now = Date.now();
      for (const gameId of activeGames) {
        try {
          const state = await loadGame(deps.redis, gameId);
          if (!state || state.status !== "playing") {
            activeGames.delete(gameId);
            continue;
          }
          const ticked = applyClockTick(
            {
              whiteMs: state.whiteMs,
              blackMs: state.blackMs,
              turn: state.turn,
              lastMoveAt: state.lastMoveAt,
              incrementMs: state.incrementMs,
            },
            now,
          );
          if (ticked.flagged) {
            await finalizeGame(gameId, ...endTuple(flagResult(state.fen, ticked.flagged)));
          }
        } catch (err) {
          logger.error({ err, gameId }, "clock tick failed");
        }
      }
    })();
  }, clockTickMs);
  clockTimer.unref?.();

  const matchTimer = setInterval(() => {
    // Idle gate: an empty queue costs zero Redis commands; the backstop still
    // runs every MATCH_BACKSTOP_MS for seekers orphaned by a crashed node.
    if (queuedSockets.size === 0 && Date.now() - lastSweepAt < MATCH_BACKSTOP_MS) return;
    runSweep().catch((err: unknown) => logger.error({ err }, "sweep failed"));
  }, matchSweepMs);
  matchTimer.unref?.();

  async function close(): Promise<void> {
    closing = true;
    clearInterval(clockTimer);
    clearInterval(matchTimer);
    for (const timer of graceTimers.values()) clearTimeout(timer);
    graceTimers.clear();
    // Suspend active games so clocks skip the downtime on next load.
    for (const gameId of activeGames) {
      try {
        const state = await loadGame(deps.redis, gameId);
        if (state && state.status === "playing") {
          state.suspendedAt = Date.now();
          await saveGame(deps.redis, state);
        }
      } catch (err) {
        logger.error({ err, gameId }, "failed to suspend game");
      }
    }
    io.close();
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err?: Error) => (err ? reject(err) : resolve()));
    });
  }

  return {
    httpServer,
    io,
    redis: deps.redis,
    store: deps.store,
    activeGames,
    finalizeGame,
    sweepMatchmaking,
    close,
  };
}
