import { z } from "zod";
import { TIME_CONTROL_IDS } from "./constants";

/** Client -> server event names. */
export const ClientEvent = {
  QueueJoin: "queue:join",
  QueueLeave: "queue:leave",
  Move: "move",
  Resign: "resign",
  DrawOffer: "draw:offer",
  DrawAccept: "draw:accept",
  DrawDecline: "draw:decline",
  Rejoin: "rejoin",
} as const;

/** Server -> client event names. */
export const ServerEvent = {
  GameStart: "game:start",
  MoveOk: "move:ok",
  MoveRejected: "move:rejected",
  DrawOffered: "draw:offered",
  DrawDeclined: "draw:declined",
  GameOver: "game:over",
  OpponentDisconnected: "opponent:disconnected",
  OpponentReconnected: "opponent:reconnected",
  Error: "error",
} as const;

export const squareSchema = z.string().regex(/^[a-h][1-8]$/, "must be a square like e4");
export const colorSchema = z.enum(["w", "b"]);
export const uuidSchema = z.string().uuid();
export const timeControlSchema = z.enum(TIME_CONTROL_IDS);

export const gameResultSchema = z.enum(["WHITE_WIN", "BLACK_WIN", "DRAW"]);
export type GameResult = z.infer<typeof gameResultSchema>;

export const terminationSchema = z.enum([
  "CHECKMATE",
  "RESIGN",
  "TIMEOUT",
  "STALEMATE",
  "AGREEMENT",
  "INSUFFICIENT_MATERIAL",
  "THREEFOLD",
  "FIFTY_MOVE",
  "ABANDONED",
]);
export type Termination = z.infer<typeof terminationSchema>;

// ---------- Client -> server payloads (validated with zod on every inbound message) ----------

export const queueJoinSchema = z.object({ timeControl: timeControlSchema }).strict();
export type QueueJoinPayload = z.infer<typeof queueJoinSchema>;

export const queueLeaveSchema = z.object({}).strict();
export type QueueLeavePayload = z.infer<typeof queueLeaveSchema>;

export const moveSchema = z
  .object({
    gameId: uuidSchema,
    from: squareSchema,
    to: squareSchema,
    promotion: z.enum(["q", "r", "b", "n"]).optional(),
  })
  .strict();
export type MovePayload = z.infer<typeof moveSchema>;

export const gameIdPayloadSchema = z.object({ gameId: uuidSchema }).strict();
export type GameIdPayload = z.infer<typeof gameIdPayloadSchema>;

// ---------- Server -> client payloads ----------

export const clocksSchema = z.object({
  whiteMs: z.number().int().nonnegative(),
  blackMs: z.number().int().nonnegative(),
});
export type ClocksPayload = z.infer<typeof clocksSchema>;

export const playerInfoSchema = z.object({
  id: z.string(),
  username: z.string(),
  rating: z.number().int(),
});
export type PlayerInfo = z.infer<typeof playerInfoSchema>;

export const storedMoveSchema = z.object({
  from: squareSchema,
  to: squareSchema,
  promotion: z.enum(["q", "r", "b", "n"]).optional(),
  san: z.string(),
});
export type StoredMove = z.infer<typeof storedMoveSchema>;

/**
 * Full game snapshot. Sent on match (`game:start`) and on `rejoin`, so the
 * client can always (re)build its state from a single message.
 */
export const gameStartSchema = z.object({
  gameId: uuidSchema,
  color: colorSchema,
  fen: z.string(),
  clocks: clocksSchema,
  opponent: playerInfoSchema,
  timeControl: timeControlSchema,
  turn: colorSchema,
  moves: z.array(storedMoveSchema),
  lastMove: z.object({ from: squareSchema, to: squareSchema }).nullable(),
  drawOfferBy: colorSchema.nullable(),
  status: z.enum(["playing", "finished"]),
  serverTime: z.number().int().nonnegative(),
  rejoined: z.boolean(),
});
export type GameStartPayload = z.infer<typeof gameStartSchema>;

export const moveOkSchema = z.object({
  gameId: uuidSchema,
  san: z.string(),
  fen: z.string(),
  clocks: clocksSchema,
  ply: z.number().int().nonnegative(),
  turn: colorSchema,
  lastMove: z.object({ from: squareSchema, to: squareSchema }),
  serverTime: z.number().int().nonnegative(),
});
export type MoveOkPayload = z.infer<typeof moveOkSchema>;

export const moveRejectedSchema = z.object({
  gameId: uuidSchema.optional(),
  reason: z.string(),
  fen: z.string(),
});
export type MoveRejectedPayload = z.infer<typeof moveRejectedSchema>;

export const drawOfferedSchema = z.object({ gameId: uuidSchema, by: z.string() });
export type DrawOfferedPayload = z.infer<typeof drawOfferedSchema>;

export const drawDeclinedSchema = z.object({ gameId: uuidSchema });
export type DrawDeclinedPayload = z.infer<typeof drawDeclinedSchema>;

export const playerResultSchema = z.object({
  id: z.string(),
  username: z.string(),
  ratingBefore: z.number().int(),
  ratingAfter: z.number().int(),
  delta: z.number().int(),
});
export type PlayerResult = z.infer<typeof playerResultSchema>;

export const gameOverSchema = z.object({
  gameId: uuidSchema,
  result: gameResultSchema,
  termination: terminationSchema,
  pgn: z.string(),
  white: playerResultSchema,
  black: playerResultSchema,
});
export type GameOverPayload = z.infer<typeof gameOverSchema>;

export const opponentDisconnectedSchema = z.object({
  gameId: uuidSchema,
  graceMs: z.number().int().positive(),
});
export type OpponentDisconnectedPayload = z.infer<typeof opponentDisconnectedSchema>;

export const opponentReconnectedSchema = z.object({ gameId: uuidSchema });
export type OpponentReconnectedPayload = z.infer<typeof opponentReconnectedSchema>;

export const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  gameId: uuidSchema.optional(),
});
export type ErrorPayload = z.infer<typeof errorSchema>;

// ---------- Typed Socket.IO event maps ----------

export interface ClientToServerEvents {
  "queue:join": (payload: QueueJoinPayload) => void;
  "queue:leave": (payload: QueueLeavePayload) => void;
  move: (payload: MovePayload) => void;
  resign: (payload: GameIdPayload) => void;
  "draw:offer": (payload: GameIdPayload) => void;
  "draw:accept": (payload: GameIdPayload) => void;
  "draw:decline": (payload: GameIdPayload) => void;
  rejoin: (payload: GameIdPayload) => void;
}

export interface ServerToClientEvents {
  "game:start": (payload: GameStartPayload) => void;
  "move:ok": (payload: MoveOkPayload) => void;
  "move:rejected": (payload: MoveRejectedPayload) => void;
  "draw:offered": (payload: DrawOfferedPayload) => void;
  "draw:declined": (payload: DrawDeclinedPayload) => void;
  "game:over": (payload: GameOverPayload) => void;
  "opponent:disconnected": (payload: OpponentDisconnectedPayload) => void;
  "opponent:reconnected": (payload: OpponentReconnectedPayload) => void;
  error: (payload: ErrorPayload) => void;
}
