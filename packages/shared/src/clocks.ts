import type { Color } from "./constants";

export interface ClockInput {
  whiteMs: number;
  blackMs: number;
  turn: Color;
  lastMoveAt: number;
  incrementMs: number;
}

export interface ClockTick {
  whiteMs: number;
  blackMs: number;
  /** Side whose flag fell while it was their move, if any. */
  flagged: Color | null;
}

/** Milliseconds elapsed for the side to move, from the server clock. Never negative. */
export function elapsedForSideToMove(clock: ClockInput, now: number): number {
  return Math.max(0, now - clock.lastMoveAt);
}

/**
 * Deduct elapsed server time from the side to move (FIDE-style: the mover's
 * clock runs until they complete the move). Times are clamped at zero and a
 * flag fall is reported instead of going negative. The increment is added by
 * the caller only when the move is legal.
 */
export function applyClockTick(clock: ClockInput, now: number): ClockTick {
  const elapsed = elapsedForSideToMove(clock, now);
  let { whiteMs, blackMs } = clock;
  if (clock.turn === "w") whiteMs -= elapsed;
  else blackMs -= elapsed;
  const flagged: Color | null =
    (clock.turn === "w" && whiteMs <= 0) || (clock.turn === "b" && blackMs <= 0) ? clock.turn : null;
  return { whiteMs: Math.max(0, whiteMs), blackMs: Math.max(0, blackMs), flagged };
}

export function addIncrement(ms: number, incrementMs: number): number {
  return ms + incrementMs;
}

/** Remaining time for display sync: server value minus locally elapsed time. */
export function msRemaining(clock: ClockInput, color: Color, now: number): number {
  const base = color === "w" ? clock.whiteMs : clock.blackMs;
  if (clock.turn !== color) return Math.max(0, base);
  return Math.max(0, base - elapsedForSideToMove(clock, now));
}
