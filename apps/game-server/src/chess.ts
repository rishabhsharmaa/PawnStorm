import { Chess } from "chess.js";
import {
  applyClockTick,
  type Color,
  type GameResult,
  type Termination,
} from "@pawnstorm/shared";
import type { GameState } from "./types";

export interface MoveAttempt {
  from: string;
  to: string;
  promotion?: string;
}

export interface GameEnd {
  result: GameResult;
  termination: Termination;
}

export type ApplyMoveResult =
  | { ok: true; san: string; end: GameEnd | null }
  | { ok: false; reason: string; fen: string }
  | { ok: false; flagged: Color; fen: string };

/** Determine how a position ended after `mover` just moved. Null = ongoing. */
export function detectEnd(chess: Chess, mover: Color): GameEnd | null {
  if (chess.isCheckmate()) {
    return { result: mover === "w" ? "WHITE_WIN" : "BLACK_WIN", termination: "CHECKMATE" };
  }
  if (chess.isStalemate()) return { result: "DRAW", termination: "STALEMATE" };
  if (chess.isInsufficientMaterial()) {
    return { result: "DRAW", termination: "INSUFFICIENT_MATERIAL" };
  }
  if (chess.isThreefoldRepetition()) return { result: "DRAW", termination: "THREEFOLD" };
  if (chess.isDrawByFiftyMoves()) return { result: "DRAW", termination: "FIFTY_MOVE" };
  if (chess.isDraw()) return { result: "DRAW", termination: "FIFTY_MOVE" };
  return null;
}

/** Score a flag fall: dead positions are draws, otherwise the flagger loses. */
export function flagResult(fen: string, flagged: Color): GameEnd {
  if (new Chess(fen).isInsufficientMaterial()) {
    return { result: "DRAW", termination: "INSUFFICIENT_MATERIAL" };
  }
  return {
    result: flagged === "w" ? "BLACK_WIN" : "WHITE_WIN",
    termination: "TIMEOUT",
  };
}

/**
 * Validate and apply a move to live state (mutated on success). Clock order:
 * deduct elapsed from the mover first (a flag beats the move), then validate
 * legality, then add the increment. Returns the SAN and any game end.
 */
export function applyMove(state: GameState, attempt: MoveAttempt, now: number): ApplyMoveResult {
  if (state.status !== "playing") {
    return { ok: false, reason: "game is already finished", fen: state.fen };
  }
  const mover = state.turn;

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
    return { ok: false, flagged: mover, fen: state.fen };
  }

  const chess = new Chess(state.fen);
  let san: string;
  try {
    san = chess.move({ from: attempt.from, to: attempt.to, promotion: attempt.promotion }).san;
  } catch {
    return { ok: false, reason: "illegal move", fen: state.fen };
  }

  state.whiteMs = mover === "w" ? ticked.whiteMs + state.incrementMs : ticked.whiteMs;
  state.blackMs = mover === "b" ? ticked.blackMs + state.incrementMs : ticked.blackMs;
  state.fen = chess.fen();
  state.moves.push({
    from: attempt.from,
    to: attempt.to,
    ...(attempt.promotion ? { promotion: attempt.promotion as "q" | "r" | "b" | "n" } : {}),
    san,
  });
  state.turn = mover === "w" ? "b" : "w";
  state.lastMoveAt = now;
  state.drawOfferBy = null;

  return { ok: true, san, end: detectEnd(chess, mover) };
}

function resultSuffix(result: GameResult): string {
  return result === "WHITE_WIN" ? "1-0" : result === "BLACK_WIN" ? "0-1" : "1/2-1/2";
}

/** Build a standards-shaped PGN from the stored move list. */
export function buildPgn(state: GameState): string {
  const chess = new Chess();
  for (const m of state.moves) {
    chess.move({ from: m.from, to: m.to, promotion: m.promotion });
  }
  const sans = chess.history();
  let movetext = "";
  for (let i = 0; i < sans.length; i += 2) {
    movetext += `${i / 2 + 1}. ${sans[i]}${sans[i + 1] ? ` ${sans[i + 1]}` : ""} `;
  }
  const end = state.result ? resultSuffix(state.result) : "*";
  const date = new Date(state.startedAt);
  const stamp = `${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, "0")}.${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
  return (
    `[Event "Pawnstorm rated game"]\n` +
    `[Site "Pawnstorm"]\n` +
    `[Date "${stamp}"]\n` +
    `[White "${state.white.username}"]\n` +
    `[Black "${state.black.username}"]\n` +
    `[Result "${end}"]\n` +
    `[TimeControl "${state.timeControl}"]\n` +
    `\n${movetext}${end}`
  );
}
