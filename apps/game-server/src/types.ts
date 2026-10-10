import type { Redis } from "ioredis";
import type { Color, GameResult, StoredMove, Termination, TimeControlId } from "@pawnstorm/shared";

export type { Redis };

export interface GamePlayer {
  id: string;
  username: string;
  rating: number;
  isGuest: boolean;
}

export type GameStatus = "playing" | "finished";

/** Live game state as stored in Redis at `game:{id}` (JSON). */
export interface GameState {
  id: string;
  white: GamePlayer;
  black: GamePlayer;
  whiteRatingBefore: number;
  blackRatingBefore: number;
  fen: string;
  moves: StoredMove[];
  turn: Color;
  whiteMs: number;
  blackMs: number;
  incrementMs: number;
  lastMoveAt: number;
  status: GameStatus;
  drawOfferBy: Color | null;
  timeControl: TimeControlId;
  startedAt: number;
  /** Set during graceful shutdown; load path shifts clocks forward past it. */
  suspendedAt: number | null;
  result: GameResult | null;
  termination: Termination | null;
}

/** Per-socket server-side data (never sent to clients). */
export interface SocketData {
  user: {
    id: string;
    username: string;
    rating: number;
    isGuest: boolean;
  };
  /** Time controls this socket is currently queued in. */
  queuedIn: TimeControlId[];
}

/** Finished-game summary kept briefly in Redis for rejoin/late reads. */
export interface FinishedGameSummary {
  gameId: string;
  result: GameResult;
  termination: Termination;
  pgn: string;
  white: { id: string; username: string; ratingBefore: number; ratingAfter: number; delta: number };
  black: { id: string; username: string; ratingBefore: number; ratingAfter: number; delta: number };
}
