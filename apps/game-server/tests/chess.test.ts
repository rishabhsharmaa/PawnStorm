import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { applyMove, buildPgn, detectEnd, flagResult } from "../src/chess";
import type { GameState } from "../src/types";

function testState(fen?: string, turn: "w" | "b" = "w"): GameState {
  const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const chess = new Chess(fen ?? start);
  return {
    id: "123e4567-e89b-12d3-a456-426614174000",
    white: { id: "u-white", username: "white", rating: 1200, isGuest: false },
    black: { id: "u-black", username: "black", rating: 1200, isGuest: false },
    whiteRatingBefore: 1200,
    blackRatingBefore: 1200,
    fen: chess.fen(),
    moves: [],
    turn,
    whiteMs: 300_000,
    blackMs: 300_000,
    incrementMs: 3_000,
    lastMoveAt: 1_000_000,
    status: "playing",
    drawOfferBy: null,
    timeControl: "5+3",
    startedAt: 1_000_000,
    suspendedAt: null,
    result: null,
    termination: null,
  };
}

describe("applyMove basics", () => {
  it("applies a legal move, deducts elapsed time, adds increment, flips turn", () => {
    const s = testState();
    const out = applyMove(s, { from: "e2", to: "e4" }, 1_005_000);
    expect(out.ok).toBe(true);
    if (!out.ok || "flagged" in out) throw new Error("expected success");
    expect(out.san).toBe("e4");
    expect(out.end).toBeNull();
    expect(s.turn).toBe("b");
    expect(s.whiteMs).toBe(295_000 + 3_000);
    expect(s.blackMs).toBe(300_000);
    expect(s.lastMoveAt).toBe(1_005_000);
    expect(s.moves).toEqual([{ from: "e2", to: "e4", san: "e4" }]);
  });

  it("rejects illegal moves without touching clocks or state", () => {
    const s = testState();
    const out = applyMove(s, { from: "e2", to: "e5" }, 1_005_000);
    expect(out).toMatchObject({ ok: false, reason: "illegal move" });
    expect(s.fen).toBe(new Chess().fen());
    expect(s.whiteMs).toBe(300_000);
    expect(s.turn).toBe("w");
  });

  it("rejects moves on finished games", () => {
    const s = testState();
    s.status = "finished";
    expect(applyMove(s, { from: "e2", to: "e4" }, 1_005_000)).toMatchObject({ ok: false });
  });

  it("flags the mover when time ran out before the move (flag beats move)", () => {
    const s = testState();
    s.whiteMs = 1_000;
    const out = applyMove(s, { from: "e2", to: "e4" }, 1_005_000);
    expect(out).toMatchObject({ ok: false, flagged: "w" });
    expect(s.moves).toEqual([]);
  });
});

describe("special moves", () => {
  it("allows castling through chess.js validation", () => {
    const s = testState("r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1");
    const out = applyMove(s, { from: "e1", to: "g1" }, 1_001_000);
    expect(out.ok).toBe(true);
    if (out.ok && !("flagged" in out)) expect(out.san).toBe("O-O");
  });

  it("rejects castling while in check", () => {
    const w = testState("rnb1kbnr/pppp1ppp/8/4p3/5PPq/8/PPPPP2P/RNBQKBNR w KQkq - 0 1");
    const out = applyMove(w, { from: "e1", to: "g1" }, 1_001_000);
    expect(out).toMatchObject({ ok: false, reason: "illegal move" });
  });

  it("allows en passant", () => {
    const s = testState("rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 1");
    const out = applyMove(s, { from: "e5", to: "d6" }, 1_001_000);
    expect(out.ok).toBe(true);
    if (out.ok && !("flagged" in out)) expect(out.san).toBe("exd6");
    expect(new Chess(s.fen).get("d5")).toBeUndefined();
  });

  it("requires and applies promotion", () => {
    const s = testState("8/2P5/8/8/8/1k6/8/4K3 w - - 0 1");
    const missing = applyMove(s, { from: "c7", to: "c8" }, 1_001_000);
    expect(missing).toMatchObject({ ok: false, reason: "illegal move" });
    const out = applyMove(s, { from: "c7", to: "c8", promotion: "q" }, 1_001_000);
    expect(out.ok).toBe(true);
    if (out.ok && !("flagged" in out)) expect(out.san).toBe("c8=Q");
  });

  it("rejects moves that leave the king in check (pins)", () => {
    // White knight on e2 is pinned by the rook on e8... knight cannot move at all.
    const s = testState("4r1k1/8/8/8/8/8/4N3/4K3 w - - 0 1");
    const out = applyMove(s, { from: "e2", to: "c3" }, 1_001_000);
    expect(out).toMatchObject({ ok: false, reason: "illegal move" });
  });

  it("detects checkmate (fool's mate)", () => {
    const b = testState("rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 1", "b");
    const out = applyMove(b, { from: "d8", to: "h4" }, 1_001_000);
    expect(out.ok).toBe(true);
    if (!out.ok || "flagged" in out) throw new Error("expected success");
    expect(out.san).toBe("Qh4#");
    expect(out.end).toEqual({ result: "BLACK_WIN", termination: "CHECKMATE" });
  });
});

describe("draw detection", () => {
  it("detects stalemate", () => {
    // Black to move is stalemated (Qg7+ here would be mate, not stalemate).
    const chess = new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(chess.isStalemate()).toBe(true);
    expect(detectEnd(chess, "w")).toEqual({ result: "DRAW", termination: "STALEMATE" });
  });

  it("detects insufficient material", () => {
    const chess = new Chess("8/8/4k3/8/8/4K3/8/4B3 w - - 0 1");
    expect(detectEnd(chess, "w")).toEqual({
      result: "DRAW",
      termination: "INSUFFICIENT_MATERIAL",
    });
  });

  it("detects threefold repetition", () => {
    const chess = new Chess();
    for (const san of ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"]) {
      chess.move(san);
    }
    expect(chess.isThreefoldRepetition()).toBe(true);
    expect(detectEnd(chess, "b")).toEqual({ result: "DRAW", termination: "THREEFOLD" });
  });

  it("detects the fifty-move rule", () => {
    const chess = new Chess("6k1/8/6K1/8/8/8/8/Q7 w - - 100 150");
    expect(detectEnd(chess, "w")).toEqual({ result: "DRAW", termination: "FIFTY_MOVE" });
  });
});

describe("flagResult", () => {
  it("gives the win to the opponent on flag", () => {
    expect(flagResult(new Chess().fen(), "w")).toEqual({
      result: "BLACK_WIN",
      termination: "TIMEOUT",
    });
  });

  it("draws when the position is dead", () => {
    expect(flagResult("8/8/4k3/8/8/4K3/8/8 w - - 0 1", "w")).toEqual({
      result: "DRAW",
      termination: "INSUFFICIENT_MATERIAL",
    });
  });
});

describe("buildPgn", () => {
  it("builds a parseable PGN with headers and result", () => {
    const s = testState();
    for (const [from, to] of [["e2", "e4"], ["e7", "e5"], ["f1", "c4"]] as const) {
      const out = applyMove(s, { from, to }, s.lastMoveAt + 1000);
      if (!out.ok || "flagged" in out) throw new Error("move failed");
    }
    s.result = "WHITE_WIN";
    const pgn = buildPgn(s);
    expect(pgn).toContain('[White "white"]');
    expect(pgn).toContain('[Black "black"]');
    expect(pgn).toContain('[TimeControl "5+3"]');
    expect(pgn).toContain("1. e4 e5 2. Bc4 1-0");
    const replay = new Chess();
    replay.loadPgn(pgn);
    expect(replay.history()).toEqual(["e4", "e5", "Bc4"]);
  });
});
