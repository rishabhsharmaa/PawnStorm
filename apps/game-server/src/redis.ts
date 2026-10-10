import Redis, { type Redis as RedisClient } from "ioredis";
import type { GameState } from "./types";

export type { RedisClient };

export function createRedis(url: string): RedisClient {
  return new Redis(url, { maxRetriesPerRequest: null, enableReadyCheck: false });
}

export const keys = {
  game: (id: string): string => `game:${id}`,
  gameResult: (id: string): string => `game:${id}:result`,
  queue: (timeControl: string): string => `queue:${timeControl}`,
  userGame: (userId: string): string => `user:${userId}:game`,
  finalizeLock: (id: string): string => `finalize:${id}`,
  matchLeader: "match:leader",
};

export const gameRoom = (id: string): string => `game:${id}`;
export const userRoom = (userId: string): string => `user:${userId}`;

/**
 * Load live game state. If the game was suspended by a graceful shutdown,
 * shift the clocks forward past the downtime (in memory; the next save
 * persists it). Returns null when the game does not exist or is corrupt.
 */
export async function loadGame(redis: RedisClient, id: string): Promise<GameState | null> {
  const raw = await redis.get(keys.game(id));
  if (!raw) return null;
  let state: GameState;
  try {
    state = JSON.parse(raw) as GameState;
  } catch {
    return null;
  }
  if (!state || state.id !== id || typeof state.fen !== "string") return null;
  if (state.suspendedAt) {
    const downtime = Date.now() - state.suspendedAt;
    if (downtime > 0) state.lastMoveAt += downtime;
    state.suspendedAt = null;
  }
  return state;
}

export async function saveGame(redis: RedisClient, state: GameState): Promise<void> {
  await redis.set(keys.game(state.id), JSON.stringify(state));
}
