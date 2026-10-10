import { describe, expect, it } from "vitest";
import {
  addIncrement,
  applyClockTick,
  elapsedForSideToMove,
  msRemaining,
  type ClockInput,
} from "../src/clocks";

function clock(overrides: Partial<ClockInput> = {}): ClockInput {
  return {
    whiteMs: 300_000,
    blackMs: 300_000,
    turn: "w",
    lastMoveAt: 1_000_000,
    incrementMs: 3_000,
    ...overrides,
  };
}

describe("elapsedForSideToMove", () => {
  it("returns elapsed server time", () => {
    expect(elapsedForSideToMove(clock(), 1_005_000)).toBe(5_000);
  });

  it("never goes negative on clock skew", () => {
    expect(elapsedForSideToMove(clock(), 999_000)).toBe(0);
  });
});

describe("applyClockTick", () => {
  it("deducts elapsed time from the side to move only", () => {
    const out = applyClockTick(clock(), 1_010_000);
    expect(out.whiteMs).toBe(290_000);
    expect(out.blackMs).toBe(300_000);
    expect(out.flagged).toBeNull();
  });

  it("deducts from black when it is black's turn", () => {
    const out = applyClockTick(clock({ turn: "b" }), 1_002_500);
    expect(out.blackMs).toBe(297_500);
    expect(out.whiteMs).toBe(300_000);
    expect(out.flagged).toBeNull();
  });

  it("flags the side to move at zero and clamps", () => {
    const out = applyClockTick(clock({ whiteMs: 1_000 }), 1_001_000);
    expect(out.flagged).toBe("w");
    expect(out.whiteMs).toBe(0);
  });

  it("flags on going past zero", () => {
    const out = applyClockTick(clock({ turn: "b", blackMs: 500 }), 1_005_000);
    expect(out.flagged).toBe("b");
    expect(out.blackMs).toBe(0);
  });
});

describe("addIncrement", () => {
  it("adds increment after a legal move", () => {
    expect(addIncrement(290_000, 3_000)).toBe(293_000);
    expect(addIncrement(60_000, 0)).toBe(60_000);
  });
});

describe("msRemaining", () => {
  it("counts down only for the side to move", () => {
    const c = clock();
    expect(msRemaining(c, "w", 1_010_000)).toBe(290_000);
    expect(msRemaining(c, "b", 1_010_000)).toBe(300_000);
  });

  it("clamps at zero", () => {
    expect(msRemaining(clock({ whiteMs: 100 }), "w", 1_005_000)).toBe(0);
  });
});
