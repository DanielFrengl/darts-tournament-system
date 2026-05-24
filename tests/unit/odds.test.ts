import { describe, it, expect } from "vitest";
import {
  correctScoreDistribution,
  parimutuelOdds,
  blendOdds,
  probabilityToOdds,
} from "@/lib/odds";

describe("correctScoreDistribution", () => {
  it("best-of-3 with pA=0.7 sums to 1 and 2:0 is most likely", () => {
    const dist = correctScoreDistribution(0.7, 3);
    const total = [...dist.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(dist.get("2:0")!).toBeGreaterThan(dist.get("2:1")!);
    expect(dist.get("2:0")!).toBeGreaterThan(dist.get("1:2")!);
    expect(dist.get("2:0")!).toBeGreaterThan(dist.get("0:2")!);
  });

  it("best-of-3 with equal pA=0.5: 2:0 and 0:2 equal; 2:1 and 1:2 equal", () => {
    const dist = correctScoreDistribution(0.5, 3);
    expect(dist.get("2:0")!).toBeCloseTo(dist.get("0:2")!, 6);
    expect(dist.get("2:1")!).toBeCloseTo(dist.get("1:2")!, 6);
  });

  it("best-of-5 sums to 1 and lists 6 outcomes", () => {
    const dist = correctScoreDistribution(0.6, 5);
    expect(dist.size).toBe(6);
    const total = [...dist.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("best-of-7 sums to 1 and lists 8 outcomes", () => {
    const dist = correctScoreDistribution(0.5, 7);
    expect(dist.size).toBe(8);
    const total = [...dist.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("throws for even bestOf", () => {
    expect(() => correctScoreDistribution(0.5, 4)).toThrow();
  });
});

describe("parimutuelOdds", () => {
  it("returns null when no bets on the selection", () => {
    expect(parimutuelOdds(100, 0, 0)).toBeNull();
  });

  it("standard formula with no rake: 1000 / 250 = 4.0", () => {
    expect(parimutuelOdds(1000, 250, 0)).toBeCloseTo(4, 6);
  });

  it("rake reduces payout: 1000 with 5% rake / 250 = 3.8", () => {
    expect(parimutuelOdds(1000, 250, 0.05)).toBeCloseTo(3.8, 6);
  });
});

describe("blendOdds", () => {
  it("returns statOdds when there are no parimutuel odds", () => {
    expect(blendOdds(2.5, null, 0, 5000)).toBe(2.5);
  });

  it("with pool = 0 weights statOdds 100%", () => {
    expect(blendOdds(2.0, 3.0, 0, 5000)).toBe(2.0);
  });

  it("with pool >= threshold weights pariOdds 100%", () => {
    expect(blendOdds(2.0, 3.0, 5000, 5000)).toBe(3.0);
    expect(blendOdds(2.0, 3.0, 8000, 5000)).toBe(3.0);
  });

  it("with pool at half threshold blends 50/50", () => {
    expect(blendOdds(2.0, 4.0, 2500, 5000)).toBeCloseTo(3, 6);
  });
});

describe("probabilityToOdds", () => {
  it("p=0.5 → 2.0 with no house edge", () => {
    expect(probabilityToOdds(0.5, 0)).toBeCloseTo(2, 6);
  });

  it("p=0.5 → 1.9 with 5% house edge", () => {
    expect(probabilityToOdds(0.5, 0.05)).toBeCloseTo(1.9, 6);
  });

  it("rejects p out of (0,1)", () => {
    expect(() => probabilityToOdds(0, 0)).toThrow();
    expect(() => probabilityToOdds(1, 0)).toThrow();
  });
});
