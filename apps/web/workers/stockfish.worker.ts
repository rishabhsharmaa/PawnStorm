/**
 * Stockfish worker. The stockfish.js build is designed to BE a worker: after
 * importScripts it listens for UCI on `onmessage` and answers via postMessage.
 * Emscripten resolves its .wasm file relative to the worker script URL, so we
 * preset Module.locateFile to the CDN (jsDelivr serves CORS-enabled fetches).
 * To self-host, download the files into `public/engine/` and point CDN_BASE at
 * `${self.location.origin}/engine/`.
 */
declare function importScripts(...urls: string[]): void;
declare function postMessage(message: unknown): void;

const CDN_BASE = "https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/";

try {
  const scope = self as unknown as Record<string, unknown>;
  scope.Module = {
    ...((scope.Module as Record<string, unknown> | undefined) ?? {}),
    locateFile: (path: string) => CDN_BASE + path,
  };
  importScripts(`${CDN_BASE}stockfish.js`);
} catch {
  postMessage("pawnstorm-engine-load-error");
}

export {};
