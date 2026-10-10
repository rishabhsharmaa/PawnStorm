"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Chess, type Square } from "chess.js";
import { ChessBoardView } from "./ChessBoardView";
import { EvalBar } from "./EvalBar";
import { PlayerBar } from "./PlayerBar";
import { StockfishEngine } from "@/lib/engine";
import { getCaptured, moveListPairs } from "@/lib/chess";
import {
  classifyMove,
  scoreToCp,
  type EngineScore,
  type MoveVerdict,
} from "@/lib/uci";
import { useSettingsStore } from "@/stores/useSettingsStore";

interface ReviewGame {
  id: string;
  pgn: string;
  result: string;
  termination: string;
  timeControl: string;
  white: { username: string; ratingBefore: number; ratingAfter: number };
  black: { username: string; ratingBefore: number; ratingAfter: number };
}

interface PlyEval {
  ply: number;
  /** White-perspective centipawns (mates mapped to ±~10000). Null = unknown. */
  cp: number | null;
  /** Mate distance from White's perspective (positive = White mates). */
  mate: number | null;
}

interface MoveVerdictInfo {
  ply: number;
  verdict: MoveVerdict;
  cpLoss: number;
}

const VERDICT_STYLE: Record<MoveVerdict, { glyph: string; className: string }> = {
  best: { glyph: "", className: "" },
  good: { glyph: "", className: "" },
  inaccuracy: { glyph: "?!", className: "text-yellow-600 dark:text-yellow-400" },
  mistake: { glyph: "?", className: "text-orange-600 dark:text-orange-400" },
  blunder: { glyph: "??", className: "text-red-600 dark:text-red-400" },
};

function EvalGraph({
  evals,
  currentPly,
  onSelect,
}: {
  evals: PlyEval[];
  currentPly: number;
  onSelect: (ply: number) => void;
}): JSX.Element {
  const W = 600;
  const H = 120;
  const clamp = (cp: number | null): number => Math.max(-600, Math.min(600, cp ?? 0));
  const x = (i: number): number => (i / Math.max(1, evals.length - 1)) * W;
  const y = (cp: number | null): number => H / 2 - (clamp(cp) / 600) * (H / 2 - 4);
  const path = evals.map((e, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(e.cp).toFixed(1)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Evaluation graph"
      className="h-auto w-full cursor-pointer rounded-md bg-stone-200 dark:bg-stone-800"
      onClick={(e) => {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        onSelect(Math.round(ratio * (evals.length - 1)));
      }}
    >
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="stroke-stone-400" strokeWidth={1} />
      <path d={`${path} L${W},${H / 2} L0,${H / 2} Z`} className="fill-stone-100 opacity-60" />
      <path d={path} fill="none" className="stroke-emerald-600" strokeWidth={2} />
      <line
        x1={x(currentPly)}
        x2={x(currentPly)}
        y1={0}
        y2={H}
        className="stroke-red-500"
        strokeWidth={2}
      />
    </svg>
  );
}

export function ReviewClient({ game }: { game: ReviewGame }): JSX.Element {
  const positions = useMemo(() => {
    const full = new Chess();
    full.loadPgn(game.pgn);
    const verbose = full.history({ verbose: true });
    const replay = new Chess();
    const out: { fen: string; san: string; from: string; to: string }[] = [
      { fen: replay.fen(), san: "", from: "", to: "" },
    ];
    for (const m of verbose) {
      replay.move({ from: m.from, to: m.to, promotion: m.promotion });
      out.push({ fen: replay.fen(), san: m.san, from: m.from, to: m.to });
    }
    return out;
  }, [game.pgn]);

  const [ply, setPly] = useState(positions.length - 1);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [evals, setEvals] = useState<PlyEval[] | null>(null);
  const [verdicts, setVerdicts] = useState<MoveVerdictInfo[]>([]);
  const [engineError, setEngineError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const showCoordinates = useSettingsStore((s) => s.showCoordinates);

  const chess = useMemo(
    () => new Chess(positions[Math.min(ply, positions.length - 1)].fen),
    [positions, ply],
  );
  const captured = useMemo(() => getCaptured(chess), [chess]);
  const sans = useMemo(() => positions.slice(1).map((p) => p.san), [positions]);
  const last = positions[Math.min(ply, positions.length - 1)];
  const currentEval = evals?.[Math.min(ply, evals.length - 1)] ?? null;

  async function runAnalysis(): Promise<void> {
    const engine = new StockfishEngine();
    cancelRef.current = false;
    setAnalyzing(true);
    setProgress(0);
    setEngineError(null);
    setEvals(null);
    setVerdicts([]);
    try {
      await engine.init();
      await engine.setSkill(20);
      const found: PlyEval[] = [];
      for (let p = 0; p < positions.length; p++) {
        if (cancelRef.current) break;
        const fen = positions[p].fen;
        const sideToMove = new Chess(fen).turn();
        const res = await engine.findBestMove(fen, 300);
        const score: EngineScore | null = res.score;
        found.push({
          ply: p,
          cp: score ? scoreToCp(score, sideToMove) : null,
          mate:
            score?.type === "mate" ? (sideToMove === "w" ? score.value : -score.value) : null,
        });
        setProgress(p + 1);
      }
      if (cancelRef.current) return;
      setEvals(found);
      // Per-move verdicts from centipawn loss (mover's perspective).
      const infos: MoveVerdictInfo[] = [];
      for (let p = 1; p < found.length; p++) {
        const before = found[p - 1].cp;
        const after = found[p].cp;
        if (before === null || after === null) continue;
        const moverIsWhite = p % 2 === 1;
        const beforeM = moverIsWhite ? before : -before;
        const afterM = moverIsWhite ? after : -after;
        const cpLoss = Math.max(0, beforeM - afterM);
        const verdict = classifyMove(cpLoss);
        if (verdict !== "best" && verdict !== "good") infos.push({ ply: p, verdict, cpLoss });
      }
      setVerdicts(infos);
    } catch (err) {
      setEngineError((err as Error).message);
    } finally {
      engine.shutdown();
      setAnalyzing(false);
    }
  }

  const counts = useMemo(() => {
    const acc = {
      w: { blunder: 0, mistake: 0, inaccuracy: 0 },
      b: { blunder: 0, mistake: 0, inaccuracy: 0 },
    };
    for (const v of verdicts) {
      const side = v.ply % 2 === 1 ? "w" : "b";
      if (v.verdict === "blunder" || v.verdict === "mistake" || v.verdict === "inaccuracy") {
        acc[side][v.verdict]++;
      }
    }
    return acc;
  }, [verdicts]);

  const verdictByPly = useMemo(() => new Map(verdicts.map((v) => [v.ply, v])), [verdicts]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">
          {game.white.username} vs {game.black.username}
        </h1>
        <span className="rounded-md bg-stone-200 px-3 py-1 text-sm font-semibold dark:bg-stone-800">
          {game.timeControl} · {game.termination.toLowerCase().replace(/_/g, " ")}
        </span>
        <div className="ml-auto flex gap-2">
          {!analyzing ? (
            <button
              type="button"
              onClick={() => void runAnalysis()}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              {evals ? "Re-analyze" : "Analyze with Stockfish"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                cancelRef.current = true;
              }}
              className="rounded-md border border-stone-300 px-4 py-2 text-sm font-semibold hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
            >
              Cancel ({progress}/{positions.length})
            </button>
          )}
        </div>
      </div>

      {engineError && (
        <div role="alert" className="rounded-md bg-red-100 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
          Engine failed: {engineError} The analysis engine loads from a CDN on first use.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex gap-2">
          <EvalBar cp={currentEval?.cp ?? null} mateIn={currentEval?.mate} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <PlayerBar
              username={game.black.username}
              rating={game.black.ratingAfter}
              ratingDelta={game.black.ratingAfter - game.black.ratingBefore}
              captured={captured.byBlack}
              capturedColor="w"
              materialLead={Math.max(0, -captured.materialDiff)}
            />
            <ChessBoardView
              chess={chess}
              orientation="white"
              movableColor={null}
              lastMove={last.from ? { from: last.from as Square, to: last.to as Square } : null}
              onMove={() => undefined}
              boardId="review"
              showCoordinates={showCoordinates}
            />
            <PlayerBar
              username={game.white.username}
              rating={game.white.ratingAfter}
              ratingDelta={game.white.ratingAfter - game.white.ratingBefore}
              captured={captured.byWhite}
              capturedColor="b"
              materialLead={Math.max(0, captured.materialDiff)}
            />
          </div>
        </div>
        <aside className="flex flex-col gap-3">
          {evals ? (
            <div className="rounded-lg bg-white p-3 dark:bg-stone-900">
              <h2 className="px-1 pb-2 text-sm font-bold uppercase tracking-wide text-stone-500">
                Evaluation
              </h2>
              <EvalGraph evals={evals} currentPly={Math.min(ply, evals.length - 1)} onSelect={setPly} />
              <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <dt className="text-stone-500">White ?? / ? / ?!</dt>
                  <dd className="font-mono font-bold">
                    {counts.w.blunder} / {counts.w.mistake} / {counts.w.inaccuracy}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-500">Black ?? / ? / ?!</dt>
                  <dd className="font-mono font-bold">
                    {counts.b.blunder} / {counts.b.mistake} / {counts.b.inaccuracy}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-500">Current eval</dt>
                  <dd className="font-mono font-bold">
                    {currentEval?.mate != null
                      ? `#${Math.abs(currentEval.mate)}`
                      : currentEval?.cp != null
                        ? (currentEval.cp / 100).toFixed(1)
                        : "–"}
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="rounded-lg bg-white p-4 text-sm text-stone-500 dark:bg-stone-900">
              {analyzing
                ? `Analyzing… position ${progress} of ${positions.length}.`
                : "Run the analysis to see the eval graph and blunder flags."}
            </div>
          )}
          <div className="rounded-lg bg-white p-3 dark:bg-stone-900">
            <h2 className="px-2 text-sm font-bold uppercase tracking-wide text-stone-500">Moves</h2>
            <div className="move-list-scroll max-h-56 overflow-y-auto px-1 py-1" role="log" aria-label="Moves with verdicts">
              {moveListPairs(sans).map(([white, black], i) => (
                <div key={i} className="grid grid-cols-[2.5rem_1fr_1fr] text-sm">
                  <span className="px-2 py-0.5 text-stone-500">{i + 1}.</span>
                  {[white, black].map((san, j) => {
                    if (san === undefined) return <span key={j} />;
                    const p = i * 2 + j + 1;
                    const v = verdictByPly.get(p);
                    return (
                      <button
                        key={j}
                        type="button"
                        onClick={() => setPly(p)}
                        className={`rounded px-2 py-0.5 text-left font-medium tabular-nums ${
                          p === ply ? "bg-emerald-600 text-white" : "hover:bg-stone-200 dark:hover:bg-stone-700"
                        }`}
                      >
                        {san}
                        {v && (
                          <span className={`ml-1 font-bold ${p === ply ? "" : VERDICT_STYLE[v.verdict].className}`}>
                            {VERDICT_STYLE[v.verdict].glyph}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2 text-sm">
            <Link
              href={`/profile/${game.white.username}`}
              className="font-semibold text-emerald-700 hover:underline dark:text-emerald-500"
            >
              {game.white.username}
            </Link>
            <span className="text-stone-500">vs</span>
            <Link
              href={`/profile/${game.black.username}`}
              className="font-semibold text-emerald-700 hover:underline dark:text-emerald-500"
            >
              {game.black.username}
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
