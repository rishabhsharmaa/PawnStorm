"use client";

import { useEffect, useRef } from "react";
import { moveListPairs } from "@/lib/chess";

interface MoveListProps {
  sans: string[];
  /** Ply to highlight (1-based count of moves shown); defaults to latest. */
  currentPly?: number;
  onSelectPly?: (ply: number) => void;
}

/** Numbered move list with auto-scroll and optional click-to-navigate. */
export function MoveList({ sans, currentPly, onSelectPly }: MoveListProps): JSX.Element {
  const active = currentPly ?? sans.length;
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [sans.length]);

  if (sans.length === 0) {
    return <p className="px-3 py-2 text-sm text-stone-500">No moves yet.</p>;
  }

  return (
    <div
      className="move-list-scroll max-h-56 overflow-y-auto px-1 py-1"
      role="log"
      aria-label="Moves"
    >
      {moveListPairs(sans).map(([white, black], i) => (
        <div key={i} className="grid grid-cols-[2.5rem_1fr_1fr] text-sm">
          <span className="px-2 py-0.5 text-stone-500">{i + 1}.</span>
          {[white, black].map((san, j) => {
            if (san === undefined) return <span key={j} />;
            const ply = i * 2 + j + 1;
            const isActive = ply === active;
            return (
              <button
                key={j}
                type="button"
                disabled={!onSelectPly}
                onClick={() => onSelectPly?.(ply)}
                className={`rounded px-2 py-0.5 text-left font-medium tabular-nums ${
                  isActive
                    ? "bg-emerald-600 text-white"
                    : "hover:bg-stone-200 dark:hover:bg-stone-700"
                } ${onSelectPly ? "cursor-pointer" : "cursor-default"}`}
              >
                {san}
              </button>
            );
          })}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
