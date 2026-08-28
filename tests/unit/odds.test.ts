import { describe, it, expect } from "vitest";
import {
  correctScoreDistribution,
  parimutuelOdds,
  marketProbabilities,
  moneyWeight,
  clampOdds,
  probabilityToOdds,
  probabilityFromOdds,
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

describe("moneyWeight", () => {
  it("gives an empty book no say at all", () => {
    expect(moneyWeight(0, 5000, 0.5)).toBe(0);
  });

  it("ramps with the pool up to the cap", () => {
    expect(moneyWeight(2500, 5000, 0.5)).toBeCloseTo(0.25, 6);
    expect(moneyWeight(5000, 5000, 0.5)).toBeCloseTo(0.5, 6);
  });

  it("never exceeds the cap however deep the pool", () => {
    expect(moneyWeight(1e9, 5000, 0.5)).toBeCloseTo(0.5, 6);
  });

  it("clamps a nonsense cap into [0,1]", () => {
    expect(moneyWeight(1e9, 5000, 5)).toBeCloseTo(1, 6);
    expect(moneyWeight(1e9, 5000, -1)).toBe(0);
  });
});

describe("marketProbabilities", () => {
  it("returns the model untouched when no money is in", () => {
    expect(marketProbabilities([0.7, 0.3], [0, 0], 0.5)).toEqual([0.7, 0.3]);
  });

  it("always sums to 1", () => {
    for (const w of [0, 0.25, 0.5, 1]) {
      const p = marketProbabilities([0.5, 0.3, 0.2], [10, 900, 5], w);
      expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    }
  });

  it("renormalises a model that does not sum to 1", () => {
    // stat odds are stored rounded and clamped, so this is the normal case
    const p = marketProbabilities([0.6, 0.6], [0, 0], 0.5);
    expect(p[0]!).toBeCloseTo(0.5, 9);
    expect(p[1]!).toBeCloseTo(0.5, 9);
  });

  it("holds a lopsided book to at most 1/(1-w) times the fair price", () => {
    // 100 against 100 000 on an even match: the case that used to send the
    // light side to the ceiling and the heavy side to the floor.
    const [pLight, pHeavy] = marketProbabilities(
      [0.5, 0.5],
      [100, 100_000],
      0.5
    );
    expect(1 / pLight!).toBeLessThanOrEqual(4.0001); // 2.00 fair → max 2x
    expect(1 / pLight!).toBeGreaterThan(3.9);
    expect(1 / pHeavy!).toBeCloseTo(1.334, 2);
  });

  it("is scale free — only the ratio of money matters", () => {
    const small = marketProbabilities([0.5, 0.5], [1, 1000], 0.5);
    const large = marketProbabilities([0.5, 0.5], [1000, 1_000_000], 0.5);
    expect(small[0]!).toBeCloseTo(large[0]!, 9);
  });

  it("moves toward the money without ever crossing it", () => {
    const [a, b] = marketProbabilities([0.5, 0.5], [900, 100], 0.5);
    expect(a!).toBeGreaterThan(0.5);
    expect(a!).toBeLessThan(0.9);
    expect(b!).toBeLessThan(0.5);
  });

  it("at weight 0 ignores the pool entirely", () => {
    expect(marketProbabilities([0.5, 0.5], [0, 99999], 0)).toEqual([0.5, 0.5]);
  });

  it("at weight 1 follows the money exactly", () => {
    const p = marketProbabilities([0.9, 0.1], [250, 750], 1);
    expect(p[0]!).toBeCloseTo(0.25, 9);
    expect(p[1]!).toBeCloseTo(0.75, 9);
  });

  it("rejects mismatched input lengths", () => {
    expect(() => marketProbabilities([0.5], [1, 2], 0.5)).toThrow();
  });

  it("handles an empty market", () => {
    expect(marketProbabilities([], [], 0.5)).toEqual([]);
  });
});

describe("clampOdds", () => {
  it("lifts a sub-1.0 kurz to the floor so a winning bet still profits", () => {
    expect(clampOdds(0.95, 1.1, 25)).toBeCloseTo(1.1, 6);
  });

  it("caps a runaway long shot", () => {
    expect(clampOdds(1000, 1.1, 25)).toBeCloseTo(25, 6);
  });

  it("leaves an in-band kurz untouched", () => {
    expect(clampOdds(3.4, 1.1, 25)).toBeCloseTo(3.4, 6);
  });

  it("fails safe to the floor for NaN, caps infinity at the ceiling", () => {
    expect(clampOdds(Number.NaN, 1.1, 25)).toBeCloseTo(1.1, 6);
    expect(clampOdds(Number.POSITIVE_INFINITY, 1.1, 25)).toBeCloseTo(25, 6);
    expect(clampOdds(Number.NEGATIVE_INFINITY, 1.1, 25)).toBeCloseTo(1.1, 6);
  });

  it("throws on an inverted band", () => {
    expect(() => clampOdds(2, 5, 1)).toThrow();
  });
});

describe("probabilityFromOdds", () => {
  it("round-trips probabilityToOdds", () => {
    for (const [p, edge] of [
      [0.5, 0],
      [0.25, 0.05],
      [0.8, 0.02],
    ] as const) {
      const odds = probabilityToOdds(p, edge);
      expect(probabilityFromOdds(odds, edge)!).toBeCloseTo(p, 9);
    }
  });

  it("returns null for unusable stored odds", () => {
    expect(probabilityFromOdds(0, 0)).toBeNull();
    expect(probabilityFromOdds(-2, 0)).toBeNull();
    expect(probabilityFromOdds(Number.NaN, 0)).toBeNull();
    // odds below 1.0 would imply p > 1
    expect(probabilityFromOdds(0.5, 0)).toBeNull();
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
