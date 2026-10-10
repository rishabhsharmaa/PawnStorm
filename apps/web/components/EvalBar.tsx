"use client";

interface EvalBarProps {
  /** White-perspective centipawns, clamped for display. Null = unknown. */
  cp: number | null;
  mateIn?: number | null;
}

/** Vertical evaluation bar (white share from below). */
export function EvalBar({ cp, mateIn }: EvalBarProps): JSX.Element {
  const clamped = cp === null ? 0 : Math.max(-1000, Math.min(1000, cp));
  const whitePct = cp === null ? 50 : 50 + (clamped / 1000) * 50;
  const label =
    mateIn !== null && mateIn !== undefined
      ? `#${Math.abs(mateIn)}`
      : cp === null
        ? ""
        : (cp / 100).toFixed(1);
  return (
    <div
      role="img"
      aria-label={mateIn ? `Mate in ${Math.abs(mateIn)}` : `Evaluation ${label}`}
      className="relative w-8 shrink-0 self-stretch overflow-hidden rounded-md bg-stone-800"
      data-testid="eval-bar"
    >
      <div className="absolute inset-x-0 bottom-0 bg-stone-100" style={{ height: `${whitePct}%` }} />
      <span className="absolute inset-x-0 top-1 text-center text-[10px] font-bold mix-blend-difference invert">
        {label}
      </span>
    </div>
  );
}
