import type { TimeControlId } from "@pawnstorm/shared";
import { keys, type RedisClient } from "./redis";

export interface Seeker {
  userId: string;
  rating: number;
  joinedAt: number;
}

/** Sorted-set member encoding. Score of the member is the rating. */
export function encodeSeeker(s: Seeker): string {
  return `${s.userId}:${s.rating}:${s.joinedAt}`;
}

export function decodeSeeker(member: string): Seeker | null {
  const parts = member.split(":");
  if (parts.length !== 3) return null;
  const [userId, ratingRaw, joinedRaw] = parts;
  const rating = Number(ratingRaw);
  const joinedAt = Number(joinedRaw);
  if (!userId || !Number.isInteger(rating) || !Number.isInteger(joinedAt)) return null;
  return { userId, rating, joinedAt };
}

/** Pairing window: 100 base, +50 per 5s waited, capped at 600. */
export function ratingWindow(waitedMs: number): number {
  return Math.min(600, 100 + 50 * Math.floor(Math.max(0, waitedMs) / 5000));
}

/**
 * Find the closest-rated opponent for `me` such that each side is inside the
 * other's window. Pure and unit-tested; the caller claims the pair atomically.
 */
export function findOpponent(seekers: Seeker[], me: Seeker, now: number): Seeker | null {
  const myWindow = ratingWindow(now - me.joinedAt);
  let best: Seeker | null = null;
  let bestDiff = Infinity;
  for (const s of seekers) {
    if (s.userId === me.userId) continue;
    const diff = Math.abs(s.rating - me.rating);
    if (diff > myWindow) continue;
    if (diff > ratingWindow(now - s.joinedAt)) continue;
    if (diff < bestDiff) {
      best = s;
      bestDiff = diff;
    }
  }
  return best;
}

export async function enqueue(
  redis: RedisClient,
  timeControl: TimeControlId,
  seeker: Seeker,
): Promise<void> {
  // Remove any stale entry for this user first so re-joins refresh cleanly.
  await dequeue(redis, timeControl, seeker.userId);
  await redis.zadd(keys.queue(timeControl), seeker.rating, encodeSeeker(seeker));
}

export async function dequeue(
  redis: RedisClient,
  timeControl: TimeControlId,
  userId: string,
): Promise<void> {
  const members = await redis.zrange(keys.queue(timeControl), 0, -1);
  const stale = members.filter((m) => m === userId || m.startsWith(`${userId}:`));
  if (stale.length > 0) {
    await redis.zrem(keys.queue(timeControl), ...stale);
  }
}

export async function dequeueFromAll(
  redis: RedisClient,
  timeControls: TimeControlId[],
  userId: string,
): Promise<void> {
  for (const tc of timeControls) {
    await dequeue(redis, tc, userId);
  }
}

export async function listSeekers(
  redis: RedisClient,
  timeControl: TimeControlId,
): Promise<Seeker[]> {
  const members = await redis.zrange(keys.queue(timeControl), 0, -1);
  const out: Seeker[] = [];
  for (const m of members) {
    const s = decodeSeeker(m);
    if (s) out.push(s);
  }
  return out;
}

/**
 * Atomically claim a pair with a single ZREM (count must be 2). Partial
 * claims are rolled back. No Lua needed, works against ioredis-mock.
 */
export async function claimPair(
  redis: RedisClient,
  timeControl: TimeControlId,
  a: Seeker,
  b: Seeker,
): Promise<boolean> {
  const key = keys.queue(timeControl);
  const ma = encodeSeeker(a);
  const mb = encodeSeeker(b);
  const removed = await redis.zrem(key, ma, mb);
  if (removed === 2) return true;
  if (removed === 1) {
    const [scoreA, scoreB] = await Promise.all([
      redis.zscore(key, ma),
      redis.zscore(key, mb),
    ]);
    if (scoreA === null) await redis.zadd(key, a.rating, ma);
    if (scoreB === null) await redis.zadd(key, b.rating, mb);
  }
  return false;
}
