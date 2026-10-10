"use client";

import { create } from "zustand";
import type {
  GameOverPayload,
  GameStartPayload,
  TimeControlId,
} from "@pawnstorm/shared";
import { createGameSocket, fetchSocketToken, gameServerUrl, type GameClientSocket } from "@/lib/socket";

export type OnlineStatus = "idle" | "connecting" | "queuing" | "playing" | "over";

interface OnlineGameState {
  socket: GameClientSocket | null;
  socketConnected: boolean;
  status: OnlineStatus;
  timeControl: TimeControlId | null;
  snapshot: GameStartPayload | null;
  gameOver: GameOverPayload | null;
  lastError: string | null;
  lastErrorCode: string | null;
  errorGameId: string | null;
  opponentGone: { graceMs: number } | null;
  incomingDrawBy: string | null;
  myDrawOfferPending: boolean;
  drawDeclinedAt: number | null;

  /** Connect (fetching a fresh token) and attach listeners. Idempotent. */
  connect: () => Promise<void>;
  disconnect: () => void;
  joinQueue: (tc: TimeControlId) => void;
  leaveQueue: () => void;
  rejoin: (gameId: string) => void;
  sendMove: (from: string, to: string, promotion?: string) => void;
  resign: () => void;
  offerDraw: () => void;
  acceptDraw: () => void;
  declineDraw: () => void;
  dismissError: () => void;
  resetToIdle: () => void;
}

function attachListeners(socket: GameClientSocket): void {
  socket.on("game:start", (snap: GameStartPayload) => {
    useOnlineGameStore.setState({
      snapshot: snap,
      gameOver: null,
      status: "playing",
      timeControl: snap.timeControl,
      opponentGone: null,
      incomingDrawBy: snap.drawOfferBy && snap.drawOfferBy !== snap.color ? snap.opponent.username : null,
      myDrawOfferPending: snap.drawOfferBy === snap.color,
      lastError: null,
      lastErrorCode: null,
      errorGameId: null,
    });
  });

  socket.on("move:ok", (m) => {
    const { snapshot } = useOnlineGameStore.getState();
    if (!snapshot || snapshot.gameId !== m.gameId) return;
    useOnlineGameStore.setState({
      snapshot: {
        ...snapshot,
        fen: m.fen,
        turn: m.turn,
        clocks: m.clocks,
        serverTime: m.serverTime,
        moves: [...snapshot.moves, { from: m.lastMove.from, to: m.lastMove.to, san: m.san }],
        lastMove: m.lastMove,
        drawOfferBy: null,
      },
      incomingDrawBy: null,
      myDrawOfferPending: false,
      lastError: null,
    });
  });

  socket.on("move:rejected", (r) => {
    const { snapshot } = useOnlineGameStore.getState();
    useOnlineGameStore.setState({
      lastError: r.reason,
      lastErrorCode: "MOVE_REJECTED",
      // Resync to the authoritative position just in case.
      snapshot: snapshot && (!r.gameId || snapshot.gameId === r.gameId) ? { ...snapshot, fen: r.fen } : snapshot,
    });
  });

  socket.on("game:over", (over: GameOverPayload) => {
    useOnlineGameStore.setState({
      gameOver: over,
      status: "over",
      opponentGone: null,
      incomingDrawBy: null,
      myDrawOfferPending: false,
    });
  });

  socket.on("opponent:disconnected", (d) => {
    useOnlineGameStore.setState({ opponentGone: { graceMs: d.graceMs } });
  });

  socket.on("opponent:reconnected", () => {
    useOnlineGameStore.setState({ opponentGone: null });
  });

  socket.on("draw:offered", (d) => {
    useOnlineGameStore.setState({ incomingDrawBy: d.by });
  });

  socket.on("draw:declined", () => {
    useOnlineGameStore.setState({ myDrawOfferPending: false, drawDeclinedAt: Date.now() });
  });

  socket.on("error", (e) => {
    useOnlineGameStore.setState({
      lastError: e.message,
      lastErrorCode: e.code,
      errorGameId: e.gameId ?? null,
    });
  });

  socket.on("connect", () => {
    const { snapshot, status } = useOnlineGameStore.getState();
    useOnlineGameStore.setState({ socketConnected: true });
    // Auto re-enter the game room after a transport reconnect.
    if (snapshot && (status === "playing" || status === "over")) {
      socket.emit("rejoin", { gameId: snapshot.gameId });
    }
  });

  socket.on("disconnect", () => {
    useOnlineGameStore.setState({ socketConnected: false });
  });
}

export const useOnlineGameStore = create<OnlineGameState>()((set, get) => ({
  socket: null,
  socketConnected: false,
  status: "idle",
  timeControl: null,
  snapshot: null,
  gameOver: null,
  lastError: null,
  lastErrorCode: null,
  errorGameId: null,
  opponentGone: null,
  incomingDrawBy: null,
  myDrawOfferPending: false,
  drawDeclinedAt: null,

  connect: async () => {
    if (get().socket) return;
    set({ status: get().status === "idle" ? "connecting" : get().status });
    const token = await fetchSocketToken();
    if (get().socket) return; // raced with another connect()
    const socket = createGameSocket(gameServerUrl(), token);
    attachListeners(socket);
    set({ socket });
  },

  disconnect: () => {
    get().socket?.removeAllListeners();
    get().socket?.disconnect();
    set({
      socket: null,
      socketConnected: false,
      status: "idle",
      timeControl: null,
      snapshot: null,
      gameOver: null,
      opponentGone: null,
      incomingDrawBy: null,
      myDrawOfferPending: false,
    });
  },

  joinQueue: (tc) => {
    get().socket?.emit("queue:join", { timeControl: tc });
    set({ status: "queuing", timeControl: tc, lastError: null, gameOver: null, snapshot: null });
  },

  leaveQueue: () => {
    get().socket?.emit("queue:leave", {});
    set({ status: "idle", timeControl: null });
  },

  rejoin: (gameId) => {
    get().socket?.emit("rejoin", { gameId });
    set({ status: "connecting", lastError: null });
  },

  sendMove: (from, to, promotion) => {
    const { socket, snapshot } = get();
    if (!socket || !snapshot) return;
    socket.emit("move", promotion ? { gameId: snapshot.gameId, from, to, promotion: promotion as "q" | "r" | "b" | "n" } : { gameId: snapshot.gameId, from, to });
  },

  resign: () => {
    const { socket, snapshot } = get();
    if (!socket || !snapshot) return;
    socket.emit("resign", { gameId: snapshot.gameId });
  },

  offerDraw: () => {
    const { socket, snapshot } = get();
    if (!socket || !snapshot) return;
    socket.emit("draw:offer", { gameId: snapshot.gameId });
    set({ myDrawOfferPending: true });
  },

  acceptDraw: () => {
    const { socket, snapshot } = get();
    if (!socket || !snapshot) return;
    socket.emit("draw:accept", { gameId: snapshot.gameId });
    set({ incomingDrawBy: null });
  },

  declineDraw: () => {
    const { socket, snapshot } = get();
    if (!socket || !snapshot) return;
    socket.emit("draw:decline", { gameId: snapshot.gameId });
    set({ incomingDrawBy: null });
  },

  dismissError: () => set({ lastError: null, lastErrorCode: null, errorGameId: null }),
  resetToIdle: () =>
    set({
      status: "idle",
      timeControl: null,
      snapshot: null,
      gameOver: null,
      opponentGone: null,
      incomingDrawBy: null,
      myDrawOfferPending: false,
      drawDeclinedAt: null,
      lastError: null,
      lastErrorCode: null,
      errorGameId: null,
    }),
}));
