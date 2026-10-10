import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@pawnstorm/shared";

export type GameClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function gameServerUrl(): string {
  return process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "http://localhost:4000";
}

export function createGameSocket(url: string, token: string): GameClientSocket {
  // The installed socket.io-client's io() takes no type arguments, so the
  // typed wrapper is applied with a cast instead of generics.
  return io(url, {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  }) as unknown as GameClientSocket;
}

export async function fetchSocketToken(): Promise<string> {
  const res = await fetch("/api/socket-token", { cache: "no-store" });
  if (!res.ok) throw new Error("Could not start a game session (are you signed in?)");
  const data = (await res.json()) as { token?: unknown };
  if (typeof data.token !== "string" || data.token.length === 0) {
    throw new Error("Bad game session response");
  }
  return data.token;
}
