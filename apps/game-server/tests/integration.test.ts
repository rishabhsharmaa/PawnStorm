import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import RedisMock from "ioredis-mock";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type {
  ClientToServerEvents,
  GameOverPayload,
  GameStartPayload,
  MoveOkPayload,
  MovePayload,
  MoveRejectedPayload,
  OpponentDisconnectedPayload,
  ServerToClientEvents,
} from "@pawnstorm/shared";
import { createGameServer, type GameServerHandle } from "../src/server";
import { createLogger } from "../src/logger";
import { signSocketToken } from "../src/auth";
import { MemoryGameStore } from "../src/store";
import type { RedisClient } from "../src/redis";
import type { GameState } from "../src/types";

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

const JWT_SECRET = "test-secret-that-is-long-enough-1234";
const ALICE = { id: "user-alice", username: "alice", rating: 1200, isGuest: false };
const BOB = { id: "user-bob", username: "bob", rating: 1250, isGuest: false };

interface Harness {
  handle: GameServerHandle;
  store: MemoryGameStore;
  redis: RedisClient;
  url: string;
  clients: TestClient[];
}

async function setup(graceMs = 400): Promise<Harness> {
  const store = new MemoryGameStore();
  store.addUser(ALICE);
  store.addUser(BOB);
  const redis = new RedisMock() as unknown as RedisClient;
  // ioredis-mock instances share one global store: clear the previous test's keys.
  await redis.flushall();
  const handle = createGameServer({
    redis,
    store,
    jwtSecret: JWT_SECRET,
    webOrigin: "*",
    graceMs,
    clockTickMs: 25,
    matchSweepMs: 30,
    nodeId: "test",
    logger: createLogger("silent", "test"),
  });
  await new Promise<void>((resolve) => handle.httpServer.listen(0, "127.0.0.1", resolve));
  const port = (handle.httpServer.address() as AddressInfo).port;
  return { handle, store, redis, url: `http://127.0.0.1:${port}`, clients: [] };
}

async function teardown(h: Harness): Promise<void> {
  for (const c of h.clients) c.disconnect();
  await h.handle.close();
}

async function connectClient(
  h: Harness,
  user: typeof ALICE,
  tokenOverride?: string,
): Promise<TestClient> {
  const socket = ioClient(h.url, {
    auth: { token: tokenOverride ?? signSocketToken(user, JWT_SECRET, 300) },
    reconnection: false,
  }) as unknown as TestClient;
  h.clients.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", (err) => reject(err));
  });
  return socket;
}

function waitFor<T>(socket: TestClient, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
    const untyped = socket as unknown as { once(e: string, cb: (p: T) => void): void };
    untyped.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

interface Matched {
  alice: TestClient;
  bob: TestClient;
  startA: GameStartPayload;
  startB: GameStartPayload;
  white: TestClient;
  black: TestClient;
}

async function matchPair(h: Harness): Promise<Matched> {
  const alice = await connectClient(h, ALICE);
  const bob = await connectClient(h, BOB);
  const [startA, startB] = await Promise.all([
    waitFor<GameStartPayload>(alice, "game:start"),
    waitFor<GameStartPayload>(bob, "game:start"),
    (async () => {
      alice.emit("queue:join", { timeControl: "5+3" });
      bob.emit("queue:join", { timeControl: "5+3" });
    })(),
  ]);
  const white = startA.color === "w" ? alice : bob;
  const black = startA.color === "w" ? bob : alice;
  return { alice, bob, startA, startB, white, black };
}

async function playMove(
  mover: TestClient,
  gameId: string,
  from: string,
  to: string,
): Promise<MoveOkPayload> {
  const p = waitFor<MoveOkPayload>(mover, "move:ok");
  mover.emit("move", { gameId, from, to } as MovePayload);
  return p;
}

describe("matchmaking", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await setup();
  });
  afterEach(async () => {
    await teardown(h);
  });

  it("pairs two queued players with opposite colors and full snapshots", async () => {
    const { startA, startB } = await matchPair(h);
    expect(startA.gameId).toBe(startB.gameId);
    expect(new Set([startA.color, startB.color])).toEqual(new Set(["w", "b"]));
    expect(startA.opponent.username).toBe("bob");
    expect(startB.opponent.username).toBe("alice");
    expect(startA.clocks).toEqual({ whiteMs: 300_000, blackMs: 300_000 });
    expect(startA.timeControl).toBe("5+3");
    expect(startA.rejoined).toBe(false);
  });

  it("does not match a player who left the queue", async () => {
    const alice = await connectClient(h, ALICE);
    // Rapid join/leave pairs: without per-user handler serialization these
    // interleave and leave a phantom seeker that matches bob below.
    for (let i = 0; i < 10; i++) {
      alice.emit("queue:join", { timeControl: "5+3" });
      alice.emit("queue:leave", {});
    }
    // Give the leaves a beat to land, then queue bob alone: no match expected.
    await new Promise((r) => setTimeout(r, 150));
    const bob = await connectClient(h, BOB);
    let matched = false;
    bob.once("game:start", () => {
      matched = true;
    });
    bob.emit("queue:join", { timeControl: "5+3" });
    await new Promise((r) => setTimeout(r, 250));
    expect(matched).toBe(false);
  });
});

describe("moves and game ends", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await setup();
  });
  afterEach(async () => {
    await teardown(h);
  });

  it("plays fool's mate to checkmate and persists ratings", async () => {
    const { startA, white, black } = await matchPair(h);
    const gameId = startA.gameId;
    await playMove(white, gameId, "f2", "f3");
    await playMove(black, gameId, "e7", "e5");
    await playMove(white, gameId, "g2", "g4");
    const overP = waitFor<GameOverPayload>(white, "game:over");
    black.emit("move", { gameId, from: "d8", to: "h4" } as MovePayload);
    const over = await overP;
    expect(over.result).toBe("BLACK_WIN");
    expect(over.termination).toBe("CHECKMATE");
    expect(over.black.delta).toBeGreaterThan(0);
    expect(over.white.delta).toBeLessThan(0);
    expect(over.pgn).toContain("Qh4#");
    expect(h.store.games).toHaveLength(1);
    expect(h.store.games[0].termination).toBe("CHECKMATE");
    const whiteUser = await h.store.getUser(over.white.id);
    expect(whiteUser?.rating).toBe(over.white.ratingAfter);
  });

  it("rejects illegal moves and keeps the game going", async () => {
    const { startA, white } = await matchPair(h);
    const gameId = startA.gameId;
    const rejP = waitFor<MoveRejectedPayload>(white, "move:rejected");
    white.emit("move", { gameId, from: "e2", to: "e5" } as MovePayload);
    const rej = await rejP;
    expect(rej.reason).toBe("illegal move");
    const ok = await playMove(white, gameId, "e2", "e4");
    expect(ok.san).toBe("e4");
    expect(ok.ply).toBe(1);
  });

  it("rejects wrong-turn moves", async () => {
    const { startA, black } = await matchPair(h);
    const rejP = waitFor<MoveRejectedPayload>(black, "move:rejected");
    black.emit("move", { gameId: startA.gameId, from: "e7", to: "e5" } as MovePayload);
    const rej = await rejP;
    expect(rej.reason).toBe("not your turn");
  });

  it("rejects malformed payloads", async () => {
    const { alice } = await matchPair(h);
    const errP = waitFor<{ code: string }>(alice, "error");
    alice.emit("move", { gameId: "nope", from: "z9", to: "e4" } as unknown as MovePayload);
    expect((await errP).code).toBe("INVALID_PAYLOAD");
  });

  it("handles resignation", async () => {
    const { startA, white, black } = await matchPair(h);
    const overP = waitFor<GameOverPayload>(black, "game:over");
    white.emit("resign", { gameId: startA.gameId });
    const over = await overP;
    expect(over.result).toBe("BLACK_WIN");
    expect(over.termination).toBe("RESIGN");
  });

  it("handles draw offers, declines, and accepts", async () => {
    const { startA, white, black } = await matchPair(h);
    const gameId = startA.gameId;
    const whiteName = startA.color === "w" ? "alice" : "bob";
    const offeredP = waitFor<{ by: string }>(black, "draw:offered");
    white.emit("draw:offer", { gameId });
    expect((await offeredP).by).toBe(whiteName);
    const declinedP = waitFor<{ gameId: string }>(white, "draw:declined");
    black.emit("draw:decline", { gameId });
    expect((await declinedP).gameId).toBe(gameId);
    // Game continues after a decline.
    await playMove(white, gameId, "e2", "e4");
    const offered2P = waitFor<{ by: string }>(white, "draw:offered");
    black.emit("draw:offer", { gameId });
    await offered2P;
    const overP = waitFor<GameOverPayload>(white, "game:over");
    white.emit("draw:accept", { gameId });
    const over = await overP;
    expect(over.result).toBe("DRAW");
    expect(over.termination).toBe("AGREEMENT");
  });

  it("flags the side to move on timeout", async () => {
    const { startA, white } = await matchPair(h);
    const gameId = startA.gameId;
    const raw = await h.redis.get(`game:${gameId}`);
    const state = JSON.parse(raw as string) as GameState;
    state.whiteMs = 80;
    state.lastMoveAt = Date.now();
    await h.redis.set(`game:${gameId}`, JSON.stringify(state));
    const over = await waitFor<GameOverPayload>(white, "game:over");
    expect(over.result).toBe("BLACK_WIN");
    expect(over.termination).toBe("TIMEOUT");
  });
});

describe("disconnect and reconnect", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await setup(400);
  });
  afterEach(async () => {
    await teardown(h);
  });

  it("notifies on disconnect and restores on rejoin", async () => {
    const m = await matchPair(h);
    const gameId = m.startA.gameId;
    const discP = waitFor<OpponentDisconnectedPayload>(m.bob, "opponent:disconnected");
    m.alice.disconnect();
    const disc = await discP;
    expect(disc.gameId).toBe(gameId);
    expect(disc.graceMs).toBe(400);

    const alice2 = await connectClient(h, ALICE);
    const startP = waitFor<GameStartPayload>(alice2, "game:start");
    const reP = waitFor<{ gameId: string }>(m.bob, "opponent:reconnected");
    alice2.emit("rejoin", { gameId });
    const snap = await startP;
    expect(snap.rejoined).toBe(true);
    expect(snap.gameId).toBe(gameId);
    expect((await reP).gameId).toBe(gameId);

    // Game continues after the rejoin: White (whoever holds the socket now) opens.
    const whiteSocket = m.startA.color === "w" ? alice2 : m.bob;
    const ok = await playMove(whiteSocket, gameId, "e2", "e4");
    expect(ok.ply).toBe(1);
  });

  it("forfeits when the grace period expires", async () => {
    const m = await matchPair(h);
    const overP = waitFor<GameOverPayload>(m.bob, "game:over", 8000);
    m.alice.disconnect();
    const over = await overP;
    expect(over.termination).toBe("ABANDONED");
    const aliceIsWhite = m.startA.color === "w";
    expect(over.result).toBe(aliceIsWhite ? "BLACK_WIN" : "WHITE_WIN");
  });

  it("serves the finished result on rejoin after game over", async () => {
    const m = await matchPair(h);
    const gameId = m.startA.gameId;
    const overP = waitFor<GameOverPayload>(m.bob, "game:over");
    m.white.emit("resign", { gameId });
    await overP;
    const alice2 = await connectClient(h, ALICE);
    const againP = waitFor<GameOverPayload>(alice2, "game:over");
    alice2.emit("rejoin", { gameId });
    const again = await againP;
    expect(again.termination).toBe("RESIGN");
  });
});

describe("auth and errors", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await setup();
  });
  afterEach(async () => {
    await teardown(h);
  });

  it("rejects connections without a valid token", async () => {
    await expect(connectClient(h, ALICE, "bogus")).rejects.toThrow();
  });

  it("rejects moves from non-players", async () => {
    const m = await matchPair(h);
    h.store.addUser({ id: "user-eve", username: "eve", rating: 1200, isGuest: false });
    const eve = await connectClient(h, { id: "user-eve", username: "eve", rating: 1200, isGuest: false });
    const errP = waitFor<{ code: string }>(eve, "error");
    eve.emit("move", { gameId: m.startA.gameId, from: "e2", to: "e4" } as MovePayload);
    expect((await errP).code).toBe("NOT_IN_GAME");
  });
});
