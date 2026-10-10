import { Chess, type Move, type Square } from "chess.js";

export const START_FEN = new Chess().fen();

export type BoardColor = "white" | "black";

export function opposite(color: "w" | "b"): "w" | "b" {
  return color === "w" ? "b" : "w";
}

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export interface CapturedSummary {
  /** Black pieces captured by White (shown next to White). */
  byWhite: string[];
  /** White pieces captured by Black. */
  byBlack: string[];
  /** Material balance from White's perspective. */
  materialDiff: number;
}

/** Derive captured pieces by diffing the board against the starting counts. */
export function getCaptured(chess: Chess): CapturedSummary {
  const startCounts: Record<string, number> = {};
  for (const row of new Chess().board()) {
    for (const sq of row) {
      if (sq) {
        const key = `${sq.color}${sq.type}`;
        startCounts[key] = (startCounts[key] ?? 0) + 1;
      }
    }
  }
  const liveCounts: Record<string, number> = {};
  for (const row of chess.board()) {
    for (const sq of row) {
      if (sq) {
        const key = `${sq.color}${sq.type}`;
        liveCounts[key] = (liveCounts[key] ?? 0) + 1;
      }
    }
  }
  const byWhite: string[] = [];
  const byBlack: string[] = [];
  for (const [key, start] of Object.entries(startCounts)) {
    const missing = start - (liveCounts[key] ?? 0);
    const color = key[0];
    const type = key.slice(1);
    for (let i = 0; i < missing; i++) {
      if (color === "b") byWhite.push(type);
      else byBlack.push(type);
    }
  }
  const score = (types: string[]): number => types.reduce((s, t) => s + (PIECE_VALUES[t] ?? 0), 0);
  const materialDiff = score(byWhite) - score(byBlack);
  return { byWhite, byBlack, materialDiff };
}

export function moveListPairs(sans: string[]): [string, string?][] {
  const pairs: [string, string?][] = [];
  for (let i = 0; i < sans.length; i += 2) {
    pairs.push([sans[i], sans[i + 1]]);
  }
  return pairs;
}

/** Parse keyboard input as SAN first, then as long algebraic (e2e4 / e7e8q). */
export function parseMoveInput(
  chess: Chess,
  text: string,
): { from: Square; to: Square; promotion?: string } | null {
  const clean = text.trim().replace(/^0-0(-0)?$/i, (m) => (m.length > 3 ? "O-O-O" : "O-O"));
  try {
    const m: Move = chess.move(clean);
    chess.undo();
    return { from: m.from, to: m.to, promotion: m.promotion };
  } catch {
    // fall through to UCI parsing
  }
  const uci = clean.toLowerCase().replace(/[^a-h1-8qrbn]/g, "");
  if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
    const from = uci.slice(0, 2) as Square;
    const to = uci.slice(2, 4) as Square;
    const promotion = uci.length === 5 ? uci[4] : undefined;
    const legal = chess.moves({ square: from, verbose: true });
    if (legal.some((m) => m.to === to && (promotion ?? m.promotion) === (m.promotion ?? promotion))) {
      return { from, to, promotion };
    }
  }
  return null;
}

/** Squares a piece on `square` can legally move to (for dots/highlights). */
export function legalTargets(chess: Chess, square: Square): Square[] {
  return chess.moves({ square, verbose: true }).map((m) => m.to);
}

export function isPromotionMove(chess: Chess, from: Square, to: Square): boolean {
  const piece = chess.get(from);
  if (!piece || piece.type !== "p") return false;
  return (piece.color === "w" && to[1] === "8") || (piece.color === "b" && to[1] === "1");
}
