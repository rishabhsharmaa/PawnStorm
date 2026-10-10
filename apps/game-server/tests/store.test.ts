import { describe, expect, it } from "vitest";
import { MemoryGameStore } from "../src/store";

describe("MemoryGameStore", () => {
  it("stores users and applies finished-game rating updates", async () => {
    const store = new MemoryGameStore();
    store.addUser({ id: "a", username: "alice", rating: 1200, isGuest: false });
    store.addUser({ id: "b", username: "bob", rating: 1200, isGuest: false });

    expect(await store.getUser("a")).toMatchObject({ username: "alice" });
    expect(await store.getUser("missing")).toBeNull();

    await store.saveFinishedGame({
      id: "123e4567-e89b-12d3-a456-426614174000",
      whiteId: "a",
      blackId: "b",
      pgn: "1. e4 e5 1/2-1/2",
      result: "DRAW",
      termination: "AGREEMENT",
      timeControl: "5+3",
      whiteBefore: 1200,
      blackBefore: 1200,
      whiteAfter: 1200,
      blackAfter: 1200,
      startedAt: new Date(1000),
      endedAt: new Date(2000),
    });

    expect(store.games).toHaveLength(1);
    expect(await store.getUser("a")).toMatchObject({ rating: 1200 });
  });
});
