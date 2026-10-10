import { describe, expect, it } from "vitest";
import { calculateElo, expectedScore } from "../src/elo";
import { ELO_K, RATING_FLOOR } from "../src/constants";

describe("expectedScore", () => {
  it("gives 0.5 for equal ratings", () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5, 10);
  });

  it("favors the higher-rated player", () => {
    expect(expectedScore(1600, 1200)).toBeGreaterThan(0.9);
    expect(expectedScore(1200, 1600)).toBeLessThan(0.1);
  });
});

describe("calculateElo", () => {
  it("transfers points from loser to winner (zero-sum without floor)", () => {
    const out = calculateElo(1200, 1200, "WHITE_WIN", ELO_K);
    expect(out.whiteAfter).toBe(1216);
    expect(out.blackAfter).toBe(1184);
    expect(out.whiteDelta).toBe(16);
    expect(out.blackDelta).toBe(-16);
  });

  it("rewards underdog wins more than favorite wins", () => {
    const underdog = calculateElo(1000, 1400, "WHITE_WIN");
    const favorite = calculateElo(1400, 1000, "WHITE_WIN");
    expect(underdog.whiteDelta).toBeGreaterThan(favorite.whiteDelta);
    expect(underdog.whiteDelta).toBeGreaterThan(25);
    expect(favorite.whiteDelta).toBeLessThan(5);
  });

  it("moves ratings toward each other on draws", () => {
    const out = calculateElo(1400, 1200, "DRAW");
    expect(out.whiteDelta).toBeLessThan(0);
    expect(out.blackDelta).toBeGreaterThan(0);
  });

  it("leaves equal ratings unchanged on draws", () => {
    const out = calculateElo(1500, 1500, "DRAW");
    expect(out.whiteAfter).toBe(1500);
    expect(out.blackAfter).toBe(1500);
  });

  it("floors ratings at 100", () => {
    // Upset loss near the floor: 105 loses ~16 to 100, clamped to 100.
    const out = calculateElo(105, 100, "BLACK_WIN");
    expect(out.whiteAfter).toBe(RATING_FLOOR);
    expect(out.blackAfter).toBeGreaterThanOrEqual(RATING_FLOOR);
  });

  it("supports a custom K factor", () => {
    const low = calculateElo(1200, 1200, "WHITE_WIN", 16);
    expect(low.whiteDelta).toBe(8);
  });
});
