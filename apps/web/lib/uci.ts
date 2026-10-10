export type EngineScore = { type: "cp"; value: number } | { type: "mate"; value: number };

export interface UciInfo {
  depth: number;
  score: EngineScore | null;
}

/** Parse `score cp <n>` / `score mate <n>` and `depth <n>` from an engine info line. */
export function parseUciInfo(line: string): UciInfo | null {
  if (!line.startsWith("info ")) return null;
  const depthMatch = line.match(/\bdepth (\d+)/);
  const cpMatch = line.match(/\bscore cp (-?\d+)/);
  const mateMatch = line.match(/\bscore mate (-?\d+)/);
  let score: EngineScore | null = null;
  if (mateMatch) score = { type: "mate", value: Number(mateMatch[1]) };
  else if (cpMatch) score = { type: "cp", value: Number(cpMatch[1]) };
  return { depth: depthMatch ? Number(depthMatch[1]) : 0, score };
}

/** Parse `bestmove e2e4` (ponder suffix ignored). */
export function parseBestMove(line: string): string | null {
  const m = line.match(/^bestmove ([a-h][1-8][a-h][1-8][qrbn]?)/);
  if (!m) return null;
  return m[1] === "(none)" ? null : m[1];
}

/** Centipawn loss of playing `playedCp` instead of `bestCp` (white perspective). */
export function centipawnLoss(bestCp: number, playedCp: number): number {
  return Math.max(0, bestCp - playedCp);
}

export type MoveVerdict = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

/** Classify a move by centipawn loss (documented thresholds). */
export function classifyMove(cpLoss: number): MoveVerdict {
  if (cpLoss >= 200) return "blunder";
  if (cpLoss >= 100) return "mistake";
  if (cpLoss >= 50) return "inaccuracy";
  if (cpLoss >= 15) return "good";
  return "best";
}

/** Mate scores mapped onto a pseudo-centipawn scale for graphing. */
export function scoreToCp(score: EngineScore, sideToMove: "w" | "b"): number {
  const sign = sideToMove === "w" ? 1 : -1;
  if (score.type === "cp") return sign * score.value;
  const mate = score.value;
  if (mate === 0) return 0;
  // Winning mates approach +10000, losing mates -10000 (white perspective).
  const magnitude = Math.max(0, 10000 - Math.abs(mate) * 100);
  return sign * Math.sign(mate) * magnitude;
}
