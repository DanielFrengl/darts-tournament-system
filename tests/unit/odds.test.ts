import { describe, it, expect } from "vitest";
import {
  correctScoreDistribution,
  parimutuelOdds,
  seededParimutuelOdds,
  blendOdds,
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

describe("seededParimutuelOdds", () => {
  it("with an empty pool returns the fair statistical odds 1/p", () => {
    expect(seededParimutuelOdds(0, 0, 0.5, 500, 0)).toBeCloseTo(2, 6);
    expect(seededParimutuelOdds(0, 0, 0.25, 500, 0)).toBeCloseTo(4, 6);
  });

  it("keeps a one-sided book above 1.0 where raw parimutuel collapses", () => {
    // everyone backs A: raw parimutuel pays exactly the stake back
    expect(parimutuelOdds(1000, 1000, 0)).toBeCloseTo(1, 6);
    const seeded = seededParimutuelOdds(1000, 1000, 0.5, 500, 0);
    expect(seeded!).toBeGreaterThan(1.1);
  });

  it("stops the empty side from exploding", () => {
    // B holds 1 jablko of a 1000 pool
    expect(parimutuelOdds(1000, 1, 0)).toBeCloseTo(1000, 6);
    const seeded = seededParimutuelOdds(1000, 1, 0.5, 500, 0);
    expect(seeded!).toBeLessThan(10);
  });

  it("converges on raw parimutuel once the pool dwarfs the seed", () => {
    const raw = parimutuelOdds(1_000_000, 250_000, 0)!;
    const seeded = seededParimutuelOdds(1_000_000, 250_000, 0.25, 500, 0)!;
    expect(seeded).toBeCloseTo(raw, 1);
  });

  it("moves the heavy side down and the light side up, in that order", () => {
    const a = seededParimutuelOdds(1000, 900, 0.5, 500, 0)!;
    const b = seededParimutuelOdds(1000, 100, 0.5, 500, 0)!;
    expect(a).toBeLessThan(b);
    expect(a).toBeGreaterThan(1);
  });

  it("applies rake the same way as plain parimutuel", () => {
    const noRake = seededParimutuelOdds(1000, 250, 0.25, 500, 0)!;
    const rake = seededParimutuelOdds(1000, 250, 0.25, 500, 0.05)!;
    expect(rake).toBeCloseTo(noRake * 0.95, 6);
  });

  it("falls back to plain parimutuel when seeding is disabled", () => {
    expect(seededParimutuelOdds(1000, 250, 0.25, 0, 0)).toBeCloseTo(4, 6);
    expect(seededParimutuelOdds(100, 0, 0.5, 0, 0)).toBeNull();
  });

  it("rejects a probability outside (0,1]", () => {
    expect(() => seededParimutuelOdds(100, 10, 0, 500, 0)).toThrow();
    expect(() => seededParimutuelOdds(100, 10, 1.5, 500, 0)).toThrow();
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
