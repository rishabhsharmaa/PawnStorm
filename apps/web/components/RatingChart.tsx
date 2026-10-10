"use client";

interface RatingPoint {
  ratingAfter: number;
  createdAt: string;
}

/** Minimal SVG rating history sparkline (no chart dependency). */
export function RatingChart({ points, current }: { points: RatingPoint[]; current: number }): JSX.Element {
  if (points.length < 2) {
    return (
      <p className="text-sm text-stone-500">
        Play at least two rated games to see your rating graph.
      </p>
    );
  }
  const W = 600;
  const H = 160;
  const PAD = 28;
  const ratings = points.map((p) => p.ratingAfter);
  const min = Math.min(...ratings, current) - 10;
  const max = Math.max(...ratings, current) + 10;
  const x = (i: number): number => PAD + (i / (points.length - 1)) * (W - 2 * PAD);
  const y = (r: number): number => H - PAD - ((r - min) / (max - min)) * (H - 2 * PAD);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.ratingAfter).toFixed(1)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Rating history, currently ${current}`}
      className="h-auto w-full"
    >
      {[min, (min + max) / 2, max].map((v) => (
        <g key={v}>
          <line x1={PAD} x2={W - PAD} y1={y(v)} y2={y(v)} className="stroke-stone-300 dark:stroke-stone-700" strokeWidth={1} />
          <text x={2} y={y(v) + 4} fontSize={11} className="fill-stone-500">
            {Math.round(v)}
          </text>
        </g>
      ))}
      <path d={path} fill="none" className="stroke-emerald-600" strokeWidth={2.5} />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.ratingAfter)} r={3} className="fill-emerald-600">
          <title>{`${p.ratingAfter} on ${new Date(p.createdAt).toLocaleDateString()}`}</title>
        </circle>
      ))}
    </svg>
  );
}
