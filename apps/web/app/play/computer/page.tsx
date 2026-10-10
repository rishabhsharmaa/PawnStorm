"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { ChessBoardView, type LastMove } from "@/components/ChessBoardView";
import { GameOverModal } from "@/components/GameOverModal";
import { MoveInput } from "@/components/MoveInput";
import { MoveList } from "@/components/MoveList";
import { PlayerBar } from "@/components/PlayerBar";
import { COMPUTER_LEVELS, StockfishEngine, type EngineResult } from "@/lib/engine";
import { getCaptured, opposite, parseMoveInput } from "@/lib/chess";
import { playSound } from "@/lib/sound";
import { useSettingsStore } from "@/stores/useSettingsStore";

type EngineStatus = "loading" | "ready" | "thinking" | "error";

interface LocalResult {
  outcome: "win" | "loss" | "draw";
  reason: string;
}

function describeEnd(chess: Chess, human: "w" | "b"): LocalResult | null {
  if (chess.isCheckmate()) {
    const humanWon = chess.turn() !== human;
    return { outcome: humanWon ? "win" : "loss", reason: "checkmate" };
  }
  if (chess.isStalemate()) return { outcome: "draw", reason: "stalemate" };
  if (chess.isInsufficientMaterial()) return { outcome: "draw", reason: "insufficient material" };
  if (chess.isThreefoldRepetition()) return { outcome: "draw", reason: "threefold repetition" };
  if (chess.isDraw()) return { outcome: "draw", reason: "fifty-move rule" };
  return null;
}

export default function ComputerPage(): JSX.Element {
  const [chess, setChess] = useState(() => new Chess());
  const [level, setLevel] = useState(2);
  const [humanColor, setHumanColor] = useState<"w" | "b">("w");
  const [status, setStatus] = useState<EngineStatus>("loading");
  const [engineError, setEngineError] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [result, setResult] = useState<LocalResult | null>(null);
  const engineRef = useRef<StockfishEngine | null>(null);
  const mountedRef = useRef(false);
  const fenRef = useRef<string>(new Chess().fen());
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const showCoordinates = useSettingsStore((s) => s.showCoordinates);

  const levelCfg = useMemo(
    () => COMPUTER_LEVELS.find((l) => l.level === level) ?? COMPUTER_LEVELS[1],
    [level],
  );

  // Engine lifecycle.
  useEffect(() => {
    const engine = new StockfishEngine();
    engineRef.current = engine;
    let cancelled = false;
    setStatus("loading");
    engine
      .init()
      .then(() => engine.setSkill(levelCfg.skill))
      .then(() => {
        if (!cancelled) {
          setStatus("ready");
          setEngineError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setStatus("error");
          setEngineError(err.message);
        }
      });
    return () => {
      cancelled = true;
      engine.shutdown();
      engineRef.current = null;
    };
  }, []);

  // Apply level changes to the running engine (never mid-search: swapping the
  // worker message handler during `go` risks losing the engine's reply).
  useEffect(() => {
    if (status === "ready") {
      try {
        void engineRef.current?.setSkill(levelCfg.skill).catch(() => undefined);
      } catch {
        // Engine not initialized yet; the mount effect applies the skill.
      }
    }
  }, [levelCfg.skill, status]);

  const applyMove = useCallback(
    (from: Square, to: Square, promotion?: string): boolean => {
      if (result) return false;
      const next = new Chess(chess.fen());
      let move;
      try {
        move = next.move({ from, to, promotion });
      } catch {
        return false;
      }
      setChess(next);
      setLastMove({ from: move.from, to: move.to });
      if (next.isCheckmate() || next.isCheck()) playSound(next.isCheckmate() ? "end" : "check", soundEnabled);
      else playSound(move.captured ? "capture" : "move", soundEnabled);
      const end = describeEnd(next, humanColor);
      if (end) {
        setResult(end);
        playSound("end", soundEnabled);
      }
      return true;
    },
    [chess, humanColor, soundEnabled, result],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    fenRef.current = chess.fen();
  });

  // Engine replies. This effect deliberately returns NO cleanup: setStatus
  // below re-renders and re-runs this effect, so a cleanup flag would cancel
  // the very search it just started — dropping the engine's reply and wedging
  // the UI on "thinking" forever. Stale results (new game mid-search) are
  // dropped by the fen check instead, and unmount by mountedRef.
  useEffect(() => {
    if (status !== "ready" || result || chess.turn() === humanColor) return;
    const engine = engineRef.current;
    if (!engine) return;
    const fen = chess.fen();
    setStatus("thinking");
    let search: Promise<EngineResult>;
    try {
      search = engine.findBestMove(fen, levelCfg.movetimeMs);
    } catch (err) {
      // Synchronous engine failure must not wedge the UI on "thinking".
      console.error("Engine search failed to start:", err);
      setStatus("ready");
      return;
    }
    search.then(
      (res) => {
        if (!mountedRef.current) return;
        const fresh = fenRef.current === fen;
        setStatus("ready"); // always release, even for stale results
        if (!fresh || !res.bestMove) return;
        const from = res.bestMove.slice(0, 2) as Square;
        const to = res.bestMove.slice(2, 4) as Square;
        const promotion = res.bestMove.length === 5 ? res.bestMove[4] : undefined;
        applyMove(from, to, promotion);
      },
      (err: unknown) => {
        if (!mountedRef.current) return;
        console.error("Engine search failed:", err);
        if (fenRef.current === fen) setStatus("ready");
      },
    );
  }, [chess, humanColor, levelCfg.movetimeMs, result, status, applyMove]);

  function newGame(color: "w" | "b" | "random"): void {
    const picked = color === "random" ? (Math.random() < 0.5 ? "w" : "b") : color;
    setHumanColor(picked);
    setChess(new Chess());
    setLastMove(null);
    setResult(null);
    playSound("start", soundEnabled);
  }

  const captured = useMemo(() => getCaptured(chess), [chess]);
  const sans = useMemo(() => chess.history(), [chess]);
  const orientation = humanColor === "w" ? "white" : "black";
  const engineColor = opposite(humanColor);
  const gameOver = result !== null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Play the computer</h1>
        <label className="ml-auto flex items-center gap-2 text-sm">
          Strength
          <select
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
            className="rounded-md border border-stone-300 bg-white px-2 py-1.5 dark:border-stone-700 dark:bg-stone-900"
          >
            {COMPUTER_LEVELS.map((l) => (
              <option key={l.level} value={l.level}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          Play as
          <select
            value={humanColor}
            onChange={(e) => newGame(e.target.value as "w" | "b")}
            className="rounded-md border border-stone-300 bg-white px-2 py-1.5 dark:border-stone-700 dark:bg-stone-900"
          >
            <option value="w">White</option>
            <option value="b">Black</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => newGame("random")}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          New game
        </button>
      </div>

      {status === "error" && (
        <div role="alert" className="rounded-md bg-red-100 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
          Engine failed to start: {engineError} Check your connection and reload — the
          engine loads from a CDN on first use.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-2">
          <PlayerBar
            username={`Stockfish ${level}`}
            captured={engineColor === "w" ? captured.byWhite : captured.byBlack}
            capturedColor={engineColor === "w" ? "b" : "w"}
            materialLead={
              engineColor === "w" ? Math.max(0, captured.materialDiff) : Math.max(0, -captured.materialDiff)
            }
            active={chess.turn() === engineColor && !gameOver}
          />
          <ChessBoardView
            chess={chess}
            orientation={orientation}
            movableColor={gameOver ? null : humanColor}
            lastMove={lastMove}
            onMove={(from, to, promotion) => {
              if (!applyMove(from, to, promotion)) playSound("illegal", soundEnabled);
            }}
            boardId="computer"
            showCoordinates={showCoordinates}
          />
          <PlayerBar
            username="You"
            captured={humanColor === "w" ? captured.byWhite : captured.byBlack}
            capturedColor={humanColor === "w" ? "b" : "w"}
            materialLead={
              humanColor === "w" ? Math.max(0, captured.materialDiff) : Math.max(0, -captured.materialDiff)
            }
            active={chess.turn() === humanColor && !gameOver}
          />
        </div>
        <aside className="flex flex-col gap-3">
          <div className="rounded-lg bg-white p-3 dark:bg-stone-900">
            <h2 className="px-2 text-sm font-bold uppercase tracking-wide text-stone-500">
              Moves{" "}
              <span aria-live="polite">
                {status === "loading" && "· loading engine…"}
                {status === "thinking" && "· thinking…"}
              </span>
            </h2>
            <MoveList sans={sans} />
          </div>
          <MoveInput
            disabled={gameOver || chess.turn() !== humanColor}
            onSubmitMove={(text) => {
              const parsed = parseMoveInput(chess, text);
              if (!parsed || chess.turn() !== humanColor) return false;
              return applyMove(parsed.from, parsed.to, parsed.promotion);
            }}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={gameOver}
              onClick={() => {
                setResult({ outcome: "loss", reason: "you resigned" });
                playSound("end", soundEnabled);
              }}
              className="flex-1 rounded-md border border-stone-300 px-4 py-2 text-sm font-semibold hover:bg-stone-100 disabled:opacity-40 dark:border-stone-700 dark:hover:bg-stone-800"
            >
              Resign
            </button>
          </div>
          <p className="text-xs text-stone-500">
            Casual unrated game. Clocks only run in online play.
          </p>
        </aside>
      </div>

      {result && (
        <GameOverModal
          title={result.outcome === "win" ? "You win!" : result.outcome === "loss" ? "Stockfish wins" : "Draw"}
          subtitle={`By ${result.reason} · ${sans.length} half-moves`}
          primaryLabel="Play again"
          onPrimary={() => newGame("random")}
          secondaryLabel="Review position"
          onSecondary={() => setResult(null)}
        />
      )}
    </div>
  );
}
