"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Chessboard } from "react-chessboard";
import type { Square } from "chess.js";
import type { Chess } from "chess.js";
import { isPromotionMove, legalTargets } from "@/lib/chess";

export interface LastMove {
  from: Square;
  to: Square;
}

interface ChessBoardViewProps {
  chess: Chess;
  orientation: "white" | "black";
  /** Color allowed to move, or null for a view-only board. */
  movableColor: "w" | "b" | null;
  lastMove: LastMove | null;
  onMove: (from: Square, to: Square, promotion?: string) => void;
  boardId: string;
  showCoordinates: boolean;
}

const PROMOTION_CHOICES = [
  { piece: "q", white: "♕", black: "♛", label: "Queen" },
  { piece: "r", white: "♖", black: "♜", label: "Rook" },
  { piece: "b", white: "♗", black: "♝", label: "Bishop" },
  { piece: "n", white: "♘", black: "♞", label: "Knight" },
];

function PromotionDialog({
  color,
  onSelect,
  onCancel,
}: {
  color: "w" | "b";
  onSelect: (piece: string) => void;
  onCancel: () => void;
}): JSX.Element {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Promote pawn to"
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/60"
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div
        className="flex gap-1 rounded-lg bg-stone-100 p-2 shadow-xl dark:bg-stone-800"
        onClick={(e) => e.stopPropagation()}
      >
        {PROMOTION_CHOICES.map((c) => (
          <button
            key={c.piece}
            type="button"
            aria-label={`Promote to ${c.label}`}
            autoFocus={c.piece === "q"}
            className="rounded-md px-3 py-2 text-5xl leading-none hover:bg-emerald-200 dark:hover:bg-emerald-900"
            onClick={() => onSelect(c.piece)}
          >
            <span className={color === "w" ? "text-stone-100" : "text-stone-900"}>
              <span
                style={{
                  textShadow:
                    color === "w"
                      ? "0 0 3px #000, 0 0 3px #000"
                      : "0 0 3px #fff, 0 0 3px #fff",
                }}
              >
                {color === "w" ? c.white : c.black}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Drag + click-to-move board with legal-move dots, last-move and check
 * highlights, and a custom promotion dialog. All rules live in the parent's
 * chess.js instance (computer play) or on the server (online play); this
 * component only renders and reports intent.
 */
export function ChessBoardView({
  chess,
  orientation,
  movableColor,
  lastMove,
  onMove,
  boardId,
  showCoordinates,
}: ChessBoardViewProps): JSX.Element {
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(
    null,
  );

  const interactive = movableColor !== null && chess.turn() === movableColor;

  const targets = useMemo(
    () => (selected ? legalTargets(chess, selected) : []),
    [chess, selected],
  );

  const checkSquare = useMemo((): Square | null => {
    if (!chess.isCheck() && !chess.isCheckmate()) return null;
    const board = chess.board();
    for (const row of board) {
      for (const sq of row) {
        if (sq && sq.type === "k" && sq.color === chess.turn()) return sq.square;
      }
    }
    return null;
  }, [chess]);

  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {};
    if (lastMove) {
      styles[lastMove.from] = { backgroundColor: "rgba(255, 213, 79, 0.45)" };
      styles[lastMove.to] = { backgroundColor: "rgba(255, 213, 79, 0.45)" };
    }
    if (selected) {
      styles[selected] = { backgroundColor: "rgba(20, 160, 90, 0.5)" };
    }
    for (const t of targets) {
      const occupied = chess.get(t);
      styles[t] = occupied
        ? {
            background:
              "radial-gradient(circle, transparent 78%, rgba(20, 40, 20, 0.35) 78%)",
          }
        : {
            background: "radial-gradient(circle, rgba(20, 40, 20, 0.3) 22%, transparent 22%)",
          };
    }
    if (checkSquare) {
      styles[checkSquare] = {
        background:
          "radial-gradient(circle, rgba(255, 60, 40, 0.85) 0%, rgba(255, 60, 40, 0.4) 60%, transparent 70%)",
      };
    }
    return styles;
  }, [lastMove, selected, targets, chess, checkSquare]);

  function attemptMove(from: Square, to: Square): boolean {
    if (!interactive) return false;
    const piece = chess.get(from);
    if (!piece || piece.color !== movableColor) return false;
    if (!targets.includes(to) && !(selected === from && targets.includes(to))) {
      // For drags there is no selection yet; verify legality directly.
      if (!legalTargets(chess, from).includes(to)) return false;
    }
    if (isPromotionMove(chess, from, to)) {
      setPendingPromotion({ from, to });
      return false; // snap back; the dialog completes the move
    }
    onMove(from, to);
    return true;
  }

  function handleSquareClick(square: Square): void {
    if (!interactive) return;
    setPendingPromotion(null);
    if (selected && targets.includes(square)) {
      const from = selected;
      setSelected(null);
      attemptMove(from, square);
      return;
    }
    const piece = chess.get(square);
    if (piece && piece.color === movableColor) {
      setSelected(selected === square ? null : square);
    } else {
      setSelected(null);
    }
  }

  return (
    <div className="board-shell relative" data-testid={`board-${boardId}`}>
      <Chessboard
        id={boardId}
        position={chess.fen()}
        boardOrientation={orientation}
        arePiecesDraggable={interactive}
        animationDuration={150}
        showBoardNotation={showCoordinates}
        customSquareStyles={squareStyles}
        customDarkSquareStyle={{ backgroundColor: "#739552" }}
        customLightSquareStyle={{ backgroundColor: "#EBECD2" }}
        onSquareClick={handleSquareClick}
        onPieceDrop={(sourceSquare, targetSquare) => {
          if (!targetSquare) return false;
          const ok = attemptMove(sourceSquare, targetSquare);
          setSelected(null);
          return ok;
        }}
      />
      {pendingPromotion && movableColor && (
        <PromotionDialog
          color={movableColor}
          onSelect={(piece) => {
            onMove(pendingPromotion.from, pendingPromotion.to, piece);
            setPendingPromotion(null);
          }}
          onCancel={() => setPendingPromotion(null)}
        />
      )}
    </div>
  );
}
