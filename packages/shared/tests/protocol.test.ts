import { describe, expect, it } from "vitest";
import {
  errorSchema,
  gameIdPayloadSchema,
  gameOverSchema,
  gameStartSchema,
  moveOkSchema,
  moveRejectedSchema,
  moveSchema,
  opponentDisconnectedSchema,
  queueJoinSchema,
  queueLeaveSchema,
} from "../src/protocol";

describe("client -> server schemas", () => {
  it("accepts a valid queue:join", () => {
    expect(queueJoinSchema.safeParse({ timeControl: "5+3" }).success).toBe(true);
  });

  it("rejects unknown time controls", () => {
    expect(queueJoinSchema.safeParse({ timeControl: "99+99" }).success).toBe(false);
  });

  it("rejects extra fields (strict mode)", () => {
    expect(
      queueJoinSchema.safeParse({ timeControl: "5+3", color: "w" }).success,
    ).toBe(false);
    expect(queueLeaveSchema.safeParse({ unexpected: 1 }).success).toBe(false);
  });

  it("accepts a valid move with promotion", () => {
    const r = moveSchema.safeParse({
      gameId: "123e4567-e89b-12d3-a456-426614174000",
      from: "e7",
      to: "e8",
      promotion: "q",
    });
    expect(r.success).toBe(true);
  });

  it("rejects malformed moves", () => {
    expect(moveSchema.safeParse({ gameId: "nope", from: "e2", to: "e4" }).success).toBe(false);
    expect(
      moveSchema.safeParse({
        gameId: "123e4567-e89b-12d3-a456-426614174000",
        from: "e9",
        to: "e4",
      }).success,
    ).toBe(false);
    expect(
      moveSchema.safeParse({
        gameId: "123e4567-e89b-12d3-a456-426614174000",
        from: "e2",
        to: "e4",
        promotion: "k",
      }).success,
    ).toBe(false);
    expect(
      moveSchema.safeParse({
        gameId: "123e4567-e89b-12d3-a456-426614174000",
        from: "e2",
        to: "e4",
        clockMs: 1,
      }).success,
    ).toBe(false);
  });

  it("validates bare gameId payloads", () => {
    expect(
      gameIdPayloadSchema.safeParse({ gameId: "123e4567-e89b-12d3-a456-426614174000" }).success,
    ).toBe(true);
    expect(gameIdPayloadSchema.safeParse({ gameId: "x" }).success).toBe(false);
  });
});

describe("server -> client schemas", () => {
  const clocks = { whiteMs: 300_000, blackMs: 300_000 };
  const gid = "123e4567-e89b-12d3-a456-426614174000";

  it("accepts a full game:start snapshot", () => {
    const r = gameStartSchema.safeParse({
      gameId: gid,
      color: "w",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      clocks,
      opponent: { id: "u2", username: "bob", rating: 1250 },
      timeControl: "5+3",
      turn: "w",
      moves: [],
      lastMove: null,
      drawOfferBy: null,
      status: "playing",
      serverTime: Date.now(),
      rejoined: false,
    });
    expect(r.success).toBe(true);
  });

  it("accepts move:ok", () => {
    expect(
      moveOkSchema.safeParse({
        gameId: gid,
        san: "e4",
        fen: "x",
        clocks,
        ply: 1,
        turn: "b",
        lastMove: { from: "e2", to: "e4" },
        serverTime: 1,
      }).success,
    ).toBe(true);
  });

  it("accepts move:rejected, game:over, disconnect and error payloads", () => {
    expect(moveRejectedSchema.safeParse({ reason: "not your turn", fen: "x" }).success).toBe(true);
    expect(
      gameOverSchema.safeParse({
        gameId: gid,
        result: "WHITE_WIN",
        termination: "CHECKMATE",
        pgn: "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0",
        white: { id: "u1", username: "a", ratingBefore: 1200, ratingAfter: 1216, delta: 16 },
        black: { id: "u2", username: "b", ratingBefore: 1200, ratingAfter: 1184, delta: -16 },
      }).success,
    ).toBe(true);
    expect(
      opponentDisconnectedSchema.safeParse({ gameId: gid, graceMs: 45_000 }).success,
    ).toBe(true);
    expect(errorSchema.safeParse({ code: "RATE_LIMITED", message: "slow down" }).success).toBe(
      true,
    );
  });

  it("rejects invalid enums", () => {
    expect(
      gameOverSchema.safeParse({
        gameId: gid,
        result: "WHITE_WIN",
        termination: "CHECKMATE",
        pgn: "",
        white: { id: "u1", username: "a", ratingBefore: 1200, ratingAfter: 1216, delta: 16 },
        black: { id: "u2", username: "b", ratingBefore: 1200, ratingAfter: 1184, delta: -16 },
      }).success,
    ).toBe(true);
    expect(
      opponentDisconnectedSchema.safeParse({ gameId: gid, graceMs: 0 }).success,
    ).toBe(false);
  });
});
