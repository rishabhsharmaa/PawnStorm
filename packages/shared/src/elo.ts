import { ELO_K, RATING_FLOOR } from "./constants";
import type { GameResult } from "./protocol";

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export interface EloOutcome {
  whiteAfter: number;
  blackAfter: number;
  whiteDelta: number;
  blackDelta: number;
}

/**
 * Standard Elo update with K=32 and a floor at 100. Guests are rated like
 * everyone else so matchmaking stays fair; the leaderboard excludes guests.
 */
export function calculateElo(
  whiteBefore: number,
  blackBefore: number,
  result: GameResult,
  k: number = ELO_K,
): EloOutcome {
  const whiteScore = result === "WHITE_WIN" ? 1 : result === "DRAW" ? 0.5 : 0;
  const blackScore = 1 - whiteScore;
  const whiteAfter = Math.max(
    RATING_FLOOR,
    Math.round(whiteBefore + k * (whiteScore - expectedScore(whiteBefore, blackBefore))),
  );
  const blackAfter = Math.max(
    RATING_FLOOR,
    Math.round(blackBefore + k * (blackScore - expectedScore(blackBefore, whiteBefore))),
  );
  return {
    whiteAfter,
    blackAfter,
    whiteDelta: whiteAfter - whiteBefore,
    blackDelta: blackAfter - blackBefore,
  };
}
