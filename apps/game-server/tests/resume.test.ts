import { Chess } from "chess.js";
import RedisMock from "ioredis-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { createLogger } from "../src/logger";
import { keys, saveGame, type RedisClient } from "../src/redis";
import { resumeActiveGames } from "../src/server";
import type { GameState } from "../src/types";

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    id: "game-1",
    white: { id: "u1", username: "alice", rating: 1200, isGuest: false },
    black: { id: "u2", username: "bob", rating: 1200, isGuest: false },
    whiteRatingBefore: 1200,
    blackRatingBefore: 1200,
    fen: new Chess().fen(),
    moves: [],
    turn: "w",
    whiteMs: 300_000,
    blackMs: 300_000,
    incrementMs: 0,
    lastMoveAt: Date.now() - 60_000,
    status: "playing",
    drawOfferBy: null,
    timeControl: "5+3",
    startedAt: Date.now() - 60_000,
    suspendedAt: null,
    result: null,
    termination: null,
    ...overrides,
  };
}

describe("resumeActiveGames", () => {
  // ioredis-mock shares one in-memory store across instances in this file,
  // so flush before each test (same pattern as integration.test.ts).
  let redis: RedisClient;
  beforeEach(async () => {
    redis = new RedisMock() as unknown as RedisClient;
    await redis.flushall();
  });

  it("resumes a gracefully suspended game past its downtime", async () => {
    const suspendedAt = Date.now() - 30_000;
    const lastMoveAt = Date.now() - 90_000;
    await saveGame(redis, makeState({ suspendedAt, lastMoveAt }));
    const activeGames = new Set<string>();

    const resumed = await resumeActiveGames(redis, activeGames, createLogger("silent", "test"));

    expect(resumed).toBe(1);
    expect(activeGames.has("game-1")).toBe(true);
    const raw = await redis.get(keys.game("game-1"));
    const state = JSON.parse(raw as string) as GameState;
    expect(state.suspendedAt).toBeNull();
    // Clock shifted forward by ~30s of downtime (generous bounds, no flake).
    expect(state.lastMoveAt).toBeGreaterThan(lastMoveAt + 20_000);
    expect(state.lastMoveAt).toBeLessThanOrEqual(Date.now());
  });

  it("forgives all downtime for crash-resumed games", async () => {
    await saveGame(redis, makeState({ lastMoveAt: Date.now() - 3_600_000 }));
    const activeGames = new Set<string>();

    const resumed = await resumeActiveGames(redis, activeGames, createLogger("silent", "test"));

    expect(resumed).toBe(1);
    const raw = await redis.get(keys.game("game-1"));
    const state = JSON.parse(raw as string) as GameState;
    expect(Date.now() - state.lastMoveAt).toBeLessThan(5_000);
  });

  it("ignores result keys, finished games, corrupt entries, and other keys", async () => {
    await saveGame(redis, makeState({ id: "game-live" }));
    await saveGame(redis, makeState({ id: "game-done", status: "finished" }));
    await redis.set(keys.gameResult("game-live"), JSON.stringify({ result: "DRAW" }));
    await redis.set(keys.game("corrupt"), "{not json");
    await redis.set(keys.userGame("u1"), "game-live");
    await redis.set(keys.matchLeader, "other-node");
    const activeGames = new Set<string>();

    const resumed = await resumeActiveGames(redis, activeGames, createLogger("silent", "test"));

    expect(resumed).toBe(1);
    expect([...activeGames]).toEqual(["game-live"]);
  });
});
