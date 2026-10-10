export const TIME_CONTROL_IDS = ["1+0", "3+2", "5+3", "10+0", "15+10"] as const;
export type TimeControlId = (typeof TIME_CONTROL_IDS)[number];

export interface TimeControl {
  id: TimeControlId;
  label: string;
  baseMs: number;
  incrementMs: number;
}

export const TIME_CONTROLS: Record<TimeControlId, TimeControl> = {
  "1+0": { id: "1+0", label: "Bullet 1+0", baseMs: 60_000, incrementMs: 0 },
  "3+2": { id: "3+2", label: "Blitz 3+2", baseMs: 180_000, incrementMs: 2_000 },
  "5+3": { id: "5+3", label: "Blitz 5+3", baseMs: 300_000, incrementMs: 3_000 },
  "10+0": { id: "10+0", label: "Rapid 10+0", baseMs: 600_000, incrementMs: 0 },
  "15+10": { id: "15+10", label: "Rapid 15+10", baseMs: 900_000, incrementMs: 10_000 },
};

export function parseTimeControl(id: string): TimeControl {
  const tc = (TIME_CONTROLS as Record<string, TimeControl | undefined>)[id];
  if (!tc) throw new Error(`Unknown time control: ${id}`);
  return tc;
}

export type Color = "w" | "b";

export const RATING_DEFAULT = 1200;
export const RATING_FLOOR = 100;
export const ELO_K = 32;

/** Grace period for a disconnected player to rejoin before forfeiting. */
export const DISCONNECT_GRACE_MS = 45_000;
/** How long finished-game summaries stay in Redis for rejoin/late reads. */
export const FINISHED_GAME_TTL_SECONDS = 24 * 60 * 60;
/** TTL for the short-lived socket JWT minted by the web app. */
export const SOCKET_TOKEN_TTL_SECONDS = 300;
