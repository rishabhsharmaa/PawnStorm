"use client";

import { useEffect, useState } from "react";
import { formatClock } from "@/lib/format";

/** Local countdown from a server-provided value; `syncKey` resyncs (e.g. ply). */
export function useCountdown(serverMs: number, running: boolean, syncKey: string | number): number {
  const [displayMs, setDisplayMs] = useState(serverMs);

  useEffect(() => {
    setDisplayMs(serverMs);
  }, [serverMs, syncKey]);

  useEffect(() => {
    if (!running) return;
    const startedAt = Date.now();
    const base = serverMs;
    const id = setInterval(() => {
      setDisplayMs(Math.max(0, base - (Date.now() - startedAt)));
    }, 100);
    return () => clearInterval(id);
  }, [running, serverMs, syncKey]);

  return displayMs;
}

interface ClockViewProps {
  ms: number;
  active: boolean;
  label: string;
}

export function ClockView({ ms, active, label }: ClockViewProps): JSX.Element {
  const low = ms < 20_000;
  return (
    <div
      role="timer"
      aria-label={`${label} clock: ${formatClock(ms)}`}
      className={`rounded-md px-3 py-1.5 font-mono text-xl font-bold tabular-nums sm:text-2xl ${
        active
          ? "bg-emerald-600 text-white"
          : "bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200"
      } ${low && active ? "animate-pulse bg-red-600" : ""}`}
    >
      {formatClock(ms)}
    </div>
  );
}
