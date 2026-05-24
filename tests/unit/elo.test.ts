import { describe, it, expect } from "vitest";
import { winProbability, updateRatings, DEFAULT_K } from "@/lib/elo";

describe("winProbability", () => {
  it("equal ratings → 0.5", () => {
    expect(winProbability(1500, 1500)).toBeCloseTo(0.5, 6);
  });

  it("400 elo higher → ~0.909 win prob (10:1)", () => {
    expect(winProbability(1900, 1500)).toBeCloseTo(10 / 11, 3);
  });

  it("400 elo lower → ~0.091 win prob", () => {
    expect(winProbability(1500, 1900)).toBeCloseTo(1 / 11, 3);
  });

  it("symmetry: P(A>B) + P(B>A) = 1", () => {
    const a = 1700;
    const b = 1620;
    expect(winProbability(a, b) + winProbability(b, a)).toBeCloseTo(1, 6);
  });
});

describe("updateRatings", () => {
  it("equal ratings, A wins → A gains K/2, B loses K/2", () => {
    const r = updateRatings(1500, 1500, "A");
    expect(r.nextA).toBe(1500 + Math.round(DEFAULT_K * 0.5));
    expect(r.nextB).toBe(1500 - Math.round(DEFAULT_K * 0.5));
  });

  it("higher rating winning gains less than upset would", () => {
    const fav = updateRatings(1800, 1500, "A");
    const upset = updateRatings(1500, 1800, "A");
    const favGain = fav.nextA - 1800;
    const upsetGain = upset.nextA - 1500;
    expect(upsetGain).toBeGreaterThan(favGain);
  });

  it("zero-sum: total rating change is ~0", () => {
    const r = updateRatings(1620, 1480, "A", 32);
    const delta = r.nextA - 1620 + (r.nextB - 1480);
    expect(Math.abs(delta)).toBeLessThanOrEqual(1);
  });

  it("custom k-factor scales the swing", () => {
    const lowK = updateRatings(1500, 1500, "A", 16);
    const highK = updateRatings(1500, 1500, "A", 64);
    expect(highK.nextA - 1500).toBeGreaterThan(lowK.nextA - 1500);
  });
});
