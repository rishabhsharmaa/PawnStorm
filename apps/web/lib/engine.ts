import { parseBestMove, parseUciInfo, type EngineScore, type UciInfo } from "./uci";

export interface EngineResult {
  bestMove: string | null;
  score: EngineScore | null;
  depth: number;
}

export interface ComputerLevel {
  level: number;
  label: string;
  skill: number;
  movetimeMs: number;
}

/** Level 1 (beginner) .. 5 (strong club player), mapped to UCI Skill Level + movetime. */
export const COMPUTER_LEVELS: ComputerLevel[] = [
  { level: 1, label: "Level 1 · Beginner", skill: 0, movetimeMs: 60 },
  { level: 2, label: "Level 2 · Casual", skill: 6, movetimeMs: 120 },
  { level: 3, label: "Level 3 · Intermediate", skill: 11, movetimeMs: 250 },
  { level: 4, label: "Level 4 · Advanced", skill: 16, movetimeMs: 500 },
  { level: 5, label: "Level 5 · Expert", skill: 20, movetimeMs: 900 },
];

const INIT_TIMEOUT_MS = 20_000;

/** Dev-only engine protocol trace (visible in the browser console). */
function debug(message: string): void {
  if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    console.debug(`[stockfish] ${message}`);
  }
}

export class EngineError extends Error {}

/**
 * UCI engine running in a Web Worker. One search at a time; callers should
 * create one instance per analysis session and terminate it when done.
 */
export class StockfishEngine {
  private worker: Worker | null = null;
  private ready = false;
  private pending: {
    resolve: (r: EngineResult) => void;
    reject: (e: Error) => void;
    best: UciInfo | null;
  } | null = null;

  /** Spawn the worker and complete the UCI handshake. */
  init(): Promise<void> {
    if (this.worker) return this.ready ? Promise.resolve() : Promise.reject(new EngineError("busy"));
    return new Promise((resolve, reject) => {
      let worker: Worker;
      try {
        worker = new Worker(new URL("../workers/stockfish.worker.ts", import.meta.url));
      } catch (err) {
        reject(new EngineError(`Cannot start engine worker: ${(err as Error).message}`));
        return;
      }
      this.worker = worker;
      const timeout = setTimeout(() => {
        this.shutdown();
        reject(new EngineError("Engine failed to load (network blocked or CDN unreachable)."));
      }, INIT_TIMEOUT_MS);
      worker.onmessage = (e: MessageEvent<unknown>) => {
        const line = String(e.data ?? "");
        debug(`← ${line.slice(0, 160)}`);
        if (line === "pawnstorm-engine-load-error") {
          clearTimeout(timeout);
          this.shutdown();
          reject(new EngineError("Engine failed to load (network blocked or CDN unreachable)."));
          return;
        }
        if (line === "uciok") {
          clearTimeout(timeout);
          this.ready = true;
          worker.onmessage = (ev: MessageEvent<unknown>) => this.handleLine(String(ev.data ?? ""));
          resolve();
          return;
        }
        // Ignore other pre-handshake chatter (id name/author lines).
      };
      worker.onerror = () => {
        clearTimeout(timeout);
        this.shutdown();
        reject(new EngineError("Engine worker crashed during startup."));
      };
      worker.postMessage("uci");
    });
  }

  get isReady(): boolean {
    return this.ready && this.worker !== null;
  }

  async setSkill(skill: number): Promise<void> {
    this.ensureReady();
    this.send(`setoption name Skill Level value ${Math.max(0, Math.min(20, skill))}`);
    await this.isReadySync();
  }

  /** Blocking search: resolves with the best move when the engine answers. */
  findBestMove(fen: string, movetimeMs: number): Promise<EngineResult> {
    this.ensureReady();
    if (this.pending) return Promise.reject(new EngineError("Search already in progress"));
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject, best: null };
      this.send(`position fen ${fen}`);
      this.send(`go movetime ${Math.max(10, movetimeMs)}`);
      // Safety net in case bestmove never arrives.
      setTimeout(() => {
        if (this.pending) {
          debug("search safety timeout fired; resolving with no move");
          const p = this.pending;
          this.pending = null;
          p.resolve({ bestMove: null, score: p.best?.score ?? null, depth: p.best?.depth ?? 0 });
        }
      }, movetimeMs + 15_000);
    });
  }

  stop(): void {
    if (this.pending) this.send("stop");
  }

  shutdown(): void {
    try {
      this.worker?.terminate();
    } catch {
      // ignore shutdown races
    }
    this.worker = null;
    this.ready = false;
    if (this.pending) {
      this.pending.reject(new EngineError("Engine shut down"));
      this.pending = null;
    }
  }

  private ensureReady(): void {
    if (!this.worker || !this.ready) throw new EngineError("Engine not initialized");
  }

  private send(cmd: string): void {
    debug(`→ ${cmd}`);
    this.worker?.postMessage(cmd);
  }

  private isReadySync(): Promise<void> {
    return new Promise((resolve) => {
      const worker = this.worker;
      if (!worker) return resolve();
      const prev = worker.onmessage;
      const timeout = setTimeout(() => {
        if (worker) worker.onmessage = prev;
        resolve();
      }, 2_000);
      worker.onmessage = (e: MessageEvent<unknown>) => {
        const line = String(e.data ?? "");
        if (line === "readyok") {
          clearTimeout(timeout);
          worker.onmessage = (ev: MessageEvent<unknown>) =>
            this.handleLine(String(ev.data ?? ""));
          resolve();
        } else if (prev) {
          prev.call(worker, e);
        }
      };
      worker.postMessage("isready");
    });
  }

  private handleLine(line: string): void {
    debug(`← ${line.slice(0, 160)}`);
    const pending = this.pending;
    if (!pending) return;
    const info = parseUciInfo(line);
    if (info) {
      if (!pending.best || info.depth >= pending.best.depth) pending.best = info;
      return;
    }
    const bestMove = parseBestMove(line);
    if (bestMove !== null || line.startsWith("bestmove")) {
      this.pending = null;
      pending.resolve({
        bestMove,
        score: pending.best?.score ?? null,
        depth: pending.best?.depth ?? 0,
      });
    }
  }
}
