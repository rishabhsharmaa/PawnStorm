"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Chess, type Square } from "chess.js";
import type { GameOverPayload } from "@pawnstorm/shared";
import { ChessBoardView } from "@/components/ChessBoardView";
import { ClockView, useCountdown } from "@/components/ClockView";
import { GameOverModal } from "@/components/GameOverModal";
import { MoveInput } from "@/components/MoveInput";
import { MoveList } from "@/components/MoveList";
import { PlayerBar } from "@/components/PlayerBar";
import { getCaptured, parseMoveInput } from "@/lib/chess";
import { formatRatingDelta } from "@/lib/format";
import { playSound } from "@/lib/sound";
import { useOnlineGameStore } from "@/stores/useOnlineGameStore";
import { useSettingsStore } from "@/stores/useSettingsStore";

const TERMINATION_LABELS: Record<string, string> = {
  CHECKMATE: "checkmate",
  RESIGN: "resignation",
  TIMEOUT: "time",
  STALEMATE: "stalemate",
  AGREEMENT: "draw agreement",
  INSUFFICIENT_MATERIAL: "insufficient material",
  THREEFOLD: "threefold repetition",
  FIFTY_MOVE: "fifty-move rule",
  ABANDONED: "abandonment",
};

interface FinishedGameData {
  id: string;
  pgn: string;
  result: "WHITE_WIN" | "BLACK_WIN" | "DRAW";
  termination: string;
  timeControl: string;
  white: { id: string; username: string; ratingBefore: number; ratingAfter: number };
  black: { id: string; username: string; ratingBefore: number; ratingAfter: number };
}

function resultText(result: string): string {
  return result === "WHITE_WIN" ? "1–0" : result === "BLACK_WIN" ? "0–1" : "½–½";
}

/** Game-over headline from the viewer's perspective. */
function headlineFor(over: GameOverPayload, myId: string | null): string {
  if (over.result === "DRAW") return "Draw";
  const iWon =
    (over.result === "WHITE_WIN" && over.white.id === myId) ||
    (over.result === "BLACK_WIN" && over.black.id === myId);
  if (!myId) return over.result === "WHITE_WIN" ? "White wins" : "Black wins";
  return iWon ? "You win!" : "You lose";
}

function FinishedGame({ data }: { data: FinishedGameData }): JSX.Element {
  const fens = useMemo(() => {
    const full = new Chess();
    full.loadPgn(data.pgn);
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
  }, [data.pgn]);
  const [ply, setPly] = useState(fens.length - 1);
  const chess = useMemo(() => new Chess(fens[Math.min(ply, fens.length - 1)].fen), [fens, ply]);
  const captured = useMemo(() => getCaptured(chess), [chess]);
  const showCoordinates = useSettingsStore((s) => s.showCoordinates);
  const sans = useMemo(() => fens.slice(1).map((f) => f.san), [fens]);
  const last = fens[Math.min(ply, fens.length - 1)];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">
          {data.white.username} vs {data.black.username}
        </h1>
        <span className="rounded-md bg-stone-200 px-3 py-1 font-mono font-bold dark:bg-stone-800">
          {resultText(data.result)} · {TERMINATION_LABELS[data.termination] ?? data.termination}
        </span>
        <Link
          href={`/review/${data.id}`}
          className="ml-auto rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Analyze
        </Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-2">
          <PlayerBar
            username={data.black.username}
            rating={data.black.ratingAfter}
            ratingDelta={data.black.ratingAfter - data.black.ratingBefore}
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
            boardId="finished"
            showCoordinates={showCoordinates}
          />
          <PlayerBar
            username={data.white.username}
            rating={data.white.ratingAfter}
            ratingDelta={data.white.ratingAfter - data.white.ratingBefore}
            captured={captured.byWhite}
            capturedColor="b"
            materialLead={Math.max(0, captured.materialDiff)}
          />
        </div>
        <aside className="flex flex-col gap-3">
          <div className="rounded-lg bg-white p-3 dark:bg-stone-900">
            <h2 className="px-2 text-sm font-bold uppercase tracking-wide text-stone-500">Moves</h2>
            <MoveList sans={sans} currentPly={ply} onSelectPly={setPly} />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={ply <= 0}
              onClick={() => setPly(0)}
              aria-label="Jump to start"
              className="flex-1 rounded-md border border-stone-300 px-2 py-2 font-bold hover:bg-stone-100 disabled:opacity-40 dark:border-stone-700 dark:hover:bg-stone-800"
            >
              ⏮
            </button>
            <button
              type="button"
              disabled={ply <= 0}
              onClick={() => setPly((p) => Math.max(0, p - 1))}
              aria-label="Previous move"
              className="flex-1 rounded-md border border-stone-300 px-2 py-2 font-bold hover:bg-stone-100 disabled:opacity-40 dark:border-stone-700 dark:hover:bg-stone-800"
            >
              ◀
            </button>
            <button
              type="button"
              disabled={ply >= fens.length - 1}
              onClick={() => setPly((p) => Math.min(fens.length - 1, p + 1))}
              aria-label="Next move"
              className="flex-1 rounded-md border border-stone-300 px-2 py-2 font-bold hover:bg-stone-100 disabled:opacity-40 dark:border-stone-700 dark:hover:bg-stone-800"
            >
              ▶
            </button>
            <button
              type="button"
              disabled={ply >= fens.length - 1}
              onClick={() => setPly(fens.length - 1)}
              aria-label="Jump to end"
              className="flex-1 rounded-md border border-stone-300 px-2 py-2 font-bold hover:bg-stone-100 disabled:opacity-40 dark:border-stone-700 dark:hover:bg-stone-800"
            >
              ⏭
            </button>
          </div>
          <p className="text-xs text-stone-500">Time control {data.timeControl} · rated</p>
        </aside>
      </div>
    </div>
  );
}

function LiveGame({ gameId }: { gameId: string }): JSX.Element {
  const router = useRouter();
  const { data: session } = useSession();
  const store = useOnlineGameStore();
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const showCoordinates = useSettingsStore((s) => s.showCoordinates);
  const [confirmResign, setConfirmResign] = useState(false);
  const prevFenRef = useRef<string | null>(null);

  const snapshot = store.snapshot;
  const chess = useMemo(
    () => new Chess(snapshot?.fen ?? new Chess().fen()),
    [snapshot?.fen],
  );

  // Sounds on new moves.
  useEffect(() => {
    if (!snapshot || snapshot.gameId !== gameId) return;
    const prevFen = prevFenRef.current;
    prevFenRef.current = snapshot.fen;
    if (prevFen === null || prevFen === snapshot.fen) return;
    const last = snapshot.moves[snapshot.moves.length - 1];
    if (!last) return;
    try {
      const prev = new Chess(prevFen);
      const applied = prev.move({ from: last.from, to: last.to, promotion: last.promotion });
      const now = new Chess(snapshot.fen);
      if (now.isCheckmate() || now.isCheck()) playSound(now.isCheckmate() ? "end" : "check", soundEnabled);
      else playSound(applied.captured ? "capture" : "move", soundEnabled);
    } catch {
      playSound("move", soundEnabled);
    }
  }, [snapshot, gameId, soundEnabled]);

  const ply = snapshot?.moves.length ?? 0;
  const whiteMs = useCountdown(snapshot?.clocks.whiteMs ?? 0, snapshot?.turn === "w" && !store.gameOver, ply);
  const blackMs = useCountdown(snapshot?.clocks.blackMs ?? 0, snapshot?.turn === "b" && !store.gameOver, ply);

  if (!snapshot || snapshot.gameId !== gameId) {
    return <p className="text-stone-500">Joining game…</p>;
  }

  const myColor = snapshot.color;
  const orientation = myColor === "w" ? "white" : "black";
  const captured = getCaptured(chess);
  const sans = snapshot.moves.map((m) => m.san);
  const over = store.gameOver;
  const myId = session?.user?.id ?? null;
  const myDelta =
    over != null ? (myColor === "w" ? over.white.delta : over.black.delta) : undefined;

  const topIsWhite = orientation === "black";
  const top = {
    name: topIsWhite ? "You" : snapshot.opponent.username,
    rating: topIsWhite ? session?.user?.rating : snapshot.opponent.rating,
    captured: topIsWhite ? captured.byWhite : captured.byBlack,
    capturedColor: (topIsWhite ? "b" : "w") as "w" | "b",
    lead: topIsWhite ? Math.max(0, captured.materialDiff) : Math.max(0, -captured.materialDiff),
    ms: topIsWhite ? whiteMs : blackMs,
    active: snapshot.turn === (topIsWhite ? "w" : "b") && !over,
    label: topIsWhite ? "Your" : `${snapshot.opponent.username}'s`,
  };
  const bottom = {
    name: topIsWhite ? snapshot.opponent.username : "You",
    rating: topIsWhite ? snapshot.opponent.rating : session?.user?.rating,
    captured: topIsWhite ? captured.byBlack : captured.byWhite,
    capturedColor: (topIsWhite ? "w" : "b") as "w" | "b",
    lead: topIsWhite ? Math.max(0, -captured.materialDiff) : Math.max(0, captured.materialDiff),
    ms: topIsWhite ? blackMs : whiteMs,
    active: snapshot.turn === (topIsWhite ? "b" : "w") && !over,
    label: topIsWhite ? `${snapshot.opponent.username}'s` : "Your",
  };

  return (
    <div className="flex flex-col gap-3">
      {!store.socketConnected && (
        <div role="alert" className="rounded-md bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Connection lost — reconnecting… Your clock keeps running on the server.
        </div>
      )}
      {store.opponentGone && (
        <div role="alert" className="rounded-md bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Opponent disconnected — they have {Math.round(store.opponentGone.graceMs / 1000)}s to
          rejoin or forfeit.
        </div>
      )}
      {store.lastError && (
        <div role="alert" className="rounded-md bg-red-100 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
          {store.lastError}{" "}
          <button type="button" className="underline" onClick={store.dismissError}>
            Dismiss
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-2">
          <PlayerBar
            username={top.name}
            rating={top.rating}
            ratingDelta={myDelta !== undefined && top.name === "You" ? myDelta : undefined}
            captured={top.captured}
            capturedColor={top.capturedColor}
            materialLead={top.lead}
            active={top.active}
            clock={<ClockView ms={top.ms} active={top.active} label={top.label} />}
          />
          <ChessBoardView
            chess={chess}
            orientation={orientation}
            movableColor={over ? null : myColor}
            lastMove={
              snapshot.lastMove
                ? { from: snapshot.lastMove.from as Square, to: snapshot.lastMove.to as Square }
                : null
            }
            onMove={(from, to, promotion) => store.sendMove(from, to, promotion)}
            boardId="live"
            showCoordinates={showCoordinates}
          />
          <PlayerBar
            username={bottom.name}
            rating={bottom.rating}
            ratingDelta={myDelta !== undefined && bottom.name === "You" ? myDelta : undefined}
            captured={bottom.captured}
            capturedColor={bottom.capturedColor}
            materialLead={bottom.lead}
            active={bottom.active}
            clock={<ClockView ms={bottom.ms} active={bottom.active} label={bottom.label} />}
          />
        </div>
        <aside className="flex flex-col gap-3">
          <div className="rounded-lg bg-white p-3 dark:bg-stone-900">
            <h2 className="px-2 text-sm font-bold uppercase tracking-wide text-stone-500">
              Moves · {snapshot.timeControl}
            </h2>
            <MoveList sans={sans} />
          </div>
          <MoveInput
            disabled={!!over || snapshot.turn !== myColor}
            onSubmitMove={(text) => {
              const parsed = parseMoveInput(chess, text);
              if (!parsed) return false;
              store.sendMove(parsed.from, parsed.to, parsed.promotion);
              return true;
            }}
          />
          {store.incomingDrawBy && !over ? (
            <div className="rounded-lg bg-white p-3 dark:bg-stone-900">
              <p className="text-sm font-semibold">{store.incomingDrawBy} offers a draw</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={store.acceptDraw}
                  className="flex-1 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={store.declineDraw}
                  className="flex-1 rounded-md border border-stone-300 px-4 py-2 text-sm font-semibold hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
                >
                  Decline
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!!over || store.myDrawOfferPending}
                onClick={store.offerDraw}
                className="flex-1 rounded-md border border-stone-300 px-4 py-2 text-sm font-semibold hover:bg-stone-100 disabled:opacity-40 dark:border-stone-700 dark:hover:bg-stone-800"
              >
                {store.myDrawOfferPending ? "Offer sent…" : "Offer draw"}
              </button>
              <button
                type="button"
                disabled={!!over}
                onClick={() => {
                  if (confirmResign) {
                    store.resign();
                    setConfirmResign(false);
                  } else {
                    setConfirmResign(true);
                    setTimeout(() => setConfirmResign(false), 4000);
                  }
                }}
                className="flex-1 rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
              >
                {confirmResign ? "Confirm resign" : "Resign"}
              </button>
            </div>
          )}
          {store.drawDeclinedAt !== null && !store.incomingDrawBy && (
            <p className="text-xs text-stone-500">Draw offer declined.</p>
          )}
        </aside>
      </div>

      {over && (
        <GameOverModal
          title={headlineFor(over, myId)}
          subtitle={`By ${TERMINATION_LABELS[over.termination] ?? over.termination}${
            myDelta !== undefined ? ` · rating ${formatRatingDelta(myDelta)}` : ""
          }`}
          primaryLabel="Analyze game"
          onPrimary={() => router.push(`/review/${over.gameId}`)}
          secondaryLabel="Play again"
          onSecondary={() => {
            store.resetToIdle();
            router.push("/play/online");
          }}
        />
      )}
    </div>
  );
}

export default function GamePage({ params }: { params: { id: string } }): JSX.Element {
  const { data: session, status: sessionStatus } = useSession();
  const store = useOnlineGameStore();
  const [finished, setFinished] = useState<FinishedGameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init(): Promise<void> {
      // Already have live state for this game (just matched)? Skip the fetch.
      if (store.snapshot?.gameId === params.id) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/games/${params.id}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as { game: FinishedGameData };
          setFinished(data.game);
          setLoading(false);
          return;
        }
      } catch {
        // Fall through to live join; the API may be unreachable.
      }
      if (cancelled) return;
      if (sessionStatus === "loading") return;
      if (!session) {
        setFatal("Sign in to rejoin this live game.");
        setLoading(false);
        return;
      }
      try {
        await store.connect();
        if (cancelled) return;
        useOnlineGameStore.getState().rejoin(params.id);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setFatal((err as Error).message);
          setLoading(false);
        }
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [params.id, session, sessionStatus]);

  // Rejoining a recently finished game yields game:over with no snapshot:
  // load the archived record for the finished viewer.
  useEffect(() => {
    if (store.gameOver?.gameId !== params.id || store.snapshot || finished) return;
    let cancelled = false;
    fetch(`/api/games/${params.id}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { game: FinishedGameData } | null) => {
        if (!cancelled && data) setFinished(data.game);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [store.gameOver, store.snapshot, finished, params.id]);

  if (loading) return <p className="text-stone-500">Loading game…</p>;
  if (fatal) {
    return (
      <div className="mx-auto max-w-md text-center">
        <p role="alert" className="rounded-md bg-red-100 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
          {fatal}
        </p>
        <Link href="/login" className="mt-4 inline-block font-semibold text-emerald-700 hover:underline dark:text-emerald-500">
          Go to login →
        </Link>
      </div>
    );
  }
  // A game finished live in this client keeps the live view (modal +
  // rating delta); archived games render the finished viewer.
  if (finished && store.snapshot?.gameId !== params.id) {
    return <FinishedGame data={finished} />;
  }
  if (store.gameOver?.gameId === params.id && !store.snapshot && !finished) {
    return <p className="text-stone-500">Loading finished game…</p>;
  }
  return <LiveGame gameId={params.id} />;
}
