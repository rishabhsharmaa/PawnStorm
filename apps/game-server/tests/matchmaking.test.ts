import { describe, expect, it } from "vitest";
import {
  decodeSeeker,
  encodeSeeker,
  findOpponent,
  ratingWindow,
  type Seeker,
} from "../src/matchmaking";

describe("ratingWindow", () => {
  it("starts at 100 and widens 50 per 5s up to 600", () => {
    expect(ratingWindow(0)).toBe(100);
    expect(ratingWindow(4_999)).toBe(100);
    expect(ratingWindow(5_000)).toBe(150);
    expect(ratingWindow(30_000)).toBe(400);
    expect(ratingWindow(120_000)).toBe(600);
    expect(ratingWindow(3_600_000)).toBe(600);
  });
});

describe("encode/decodeSeeker", () => {
  it("round-trips", () => {
    const s: Seeker = { userId: "abc", rating: 1325, joinedAt: 123456789 };
    expect(decodeSeeker(encodeSeeker(s))).toEqual(s);
  });

  it("rejects garbage", () => {
    expect(decodeSeeker("abc")).toBeNull();
    expect(decodeSeeker("a:b:c")).toBeNull();
    expect(decodeSeeker("")).toBeNull();
  });
});

describe("findOpponent", () => {
  const now = 1_000_000;
  const me: Seeker = { userId: "me", rating: 1200, joinedAt: now };

  it("returns null when nobody is in range", () => {
    const seekers: Seeker[] = [
      me,
      { userId: "far", rating: 1500, joinedAt: now },
    ];
    expect(findOpponent(seekers, me, now)).toBeNull();
  });

  it("picks the closest rating within the window", () => {
    const seekers: Seeker[] = [
      me,
      { userId: "a", rating: 1290, joinedAt: now },
      { userId: "b", rating: 1210, joinedAt: now },
    ];
    expect(findOpponent(seekers, me, now)?.userId).toBe("b");
  });

  it("requires both windows to overlap", () => {
    // I waited 60s (window 600) but they just joined (window 100).
    const patient: Seeker = { userId: "me", rating: 1200, joinedAt: now - 60_000 };
    const fresh: Seeker = { userId: "fresh", rating: 1400, joinedAt: now };
    expect(findOpponent([patient, fresh], patient, now)).toBeNull();
    // After they wait too, the windows overlap.
    const later = now + 60_000;
    expect(findOpponent([patient, fresh], patient, later)?.userId).toBe("fresh");
  });

  it("never matches a player with themselves", () => {
    expect(findOpponent([me], me, now)).toBeNull();
  });
});
