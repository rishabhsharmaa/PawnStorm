import { describe, expect, it } from "vitest";
import {
  centipawnLoss,
  classifyMove,
  parseBestMove,
  parseUciInfo,
  scoreToCp,
} from "./uci";

describe("parseUciInfo", () => {
  it("parses centipawn scores and depth", () => {
    const info = parseUciInfo("info depth 18 seldepth 24 score cp 35 nodes 1 nps 1 time 10 pv e2e4");
    expect(info).toEqual({ depth: 18, score: { type: "cp", value: 35 } });
  });

  it("parses mate scores", () => {
    const info = parseUciInfo("info depth 12 score mate -2 pv a1a2");
    expect(info?.score).toEqual({ type: "mate", value: -2 });
  });

  it("ignores non-info lines", () => {
    expect(parseUciInfo("uciok")).toBeNull();
    expect(parseUciInfo("bestmove e2e4")).toBeNull();
  });

  it("returns null score when missing", () => {
    expect(parseUciInfo("info depth 1 nodes 5")).toEqual({ depth: 1, score: null });
  });
});

describe("parseBestMove", () => {
  it("parses bestmove with and without ponder", () => {
    expect(parseBestMove("bestmove e2e4 ponder e7e5")).toBe("e2e4");
    expect(parseBestMove("bestmove e7e8q")).toBe("e7e8q");
  });

  it("returns null for (none) and other lines", () => {
    expect(parseBestMove("bestmove (none)")).toBeNull();
    expect(parseBestMove("info depth 1")).toBeNull();
  });
});

describe("classifyMove", () => {
  it("applies documented thresholds", () => {
    expect(classifyMove(0)).toBe("best");
    expect(classifyMove(14)).toBe("best");
    expect(classifyMove(20)).toBe("good");
    expect(classifyMove(50)).toBe("inaccuracy");
    expect(classifyMove(99)).toBe("inaccuracy");
    expect(classifyMove(100)).toBe("mistake");
    expect(classifyMove(199)).toBe("mistake");
    expect(classifyMove(200)).toBe("blunder");
    expect(classifyMove(900)).toBe("blunder");
  });
});

describe("centipawnLoss / scoreToCp", () => {
  it("computes non-negative loss", () => {
    expect(centipawnLoss(30, 10)).toBe(20);
    expect(centipawnLoss(10, 40)).toBe(0);
  });

  it("maps scores to white-perspective centipawns", () => {
    expect(scoreToCp({ type: "cp", value: 25 }, "w")).toBe(25);
    expect(scoreToCp({ type: "cp", value: 25 }, "b")).toBe(-25);
    expect(scoreToCp({ type: "mate", value: 1 }, "w")).toBeGreaterThan(9000);
    expect(scoreToCp({ type: "mate", value: -1 }, "w")).toBeLessThan(-9000);
  });
});
