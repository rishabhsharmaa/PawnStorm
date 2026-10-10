"use client";

import type { ReactNode } from "react";
import { formatRatingDelta } from "@/lib/format";

const GLYPHS: Record<string, { w: string; b: string }> = {
  p: { w: "♙", b: "♟" },
  n: { w: "♘", b: "♞" },
  b: { w: "♗", b: "♝" },
  r: { w: "♖", b: "♜" },
  q: { w: "♕", b: "♛" },
  k: { w: "♔", b: "♚" },
};

const ORDER = ["q", "r", "b", "n", "p"];

interface PlayerBarProps {
  username: string;
  rating?: number;
  ratingDelta?: number;
  /** Piece types this player captured, e.g. ["p","n"]. */
  captured: string[];
  /** Captured piece color: pieces captured BY white are black glyphs. */
  capturedColor: "w" | "b";
  materialLead: number;
  clock?: ReactNode;
  active?: boolean;
}

export function PlayerBar({
  username,
  rating,
  ratingDelta,
  captured,
  capturedColor,
  materialLead,
  clock,
  active,
}: PlayerBarProps): JSX.Element {
  const sorted = [...captured].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${
        active ? "bg-emerald-100 dark:bg-emerald-950" : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-700 text-sm font-bold text-white"
        >
          {username.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            {username}
            {typeof rating === "number" && (
              <span className="ml-1 font-normal text-stone-500">({rating})</span>
            )}
            {typeof ratingDelta === "number" && (
              <span
                className={`ml-1 font-mono text-xs ${
                  ratingDelta >= 0 ? "text-emerald-600" : "text-red-500"
                }`}
              >
                {formatRatingDelta(ratingDelta)}
              </span>
            )}
          </div>
          <div className="truncate text-xs leading-4" aria-label="Captured pieces">
            {sorted.map((t, i) => (
              <span key={i}>{GLYPHS[t]?.[capturedColor] ?? ""}</span>
            ))}
            {materialLead > 0 && (
              <span className="ml-1 text-stone-500">+{materialLead}</span>
            )}
          </div>
        </div>
      </div>
      {clock}
    </div>
  );
}
