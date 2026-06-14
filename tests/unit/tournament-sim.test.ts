import { describe, it, expect } from "vitest";
import { simulateTournament, type SimPlayer, type SimConfig } from "@/lib/tournament-sim";

const cfg: SimConfig = {
  groupCount: 2,
  groupSize: 2,
  advancePerGroup: 1,
  bestOfGroup: 3,
  bestOfQuarter: 3,
  bestOfSemi: 3,
  bestOfFinal: 3,
  thirdPlaceMatch: false,
};

function players(ratings: number[]): SimPlayer[] {
  return ratings.map((r, i) => ({ id: `p${i}`, name: `P${i}`, eloRating: r }));
}

// deterministic RNG so the test is stable
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("simulateTournament", () => {
  it("win probabilities sum to ~1", () => {
    const res = simulateTournament(players([1600, 1500, 1400, 1300]), cfg, {
      runs: 2000,
      rng: seeded(1),
    });
    const total = Object.values(res.winProb).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it("stronger player wins more often", () => {
    const res = simulateTournament(players([1800, 1500, 1500, 1200]), cfg, {
      runs: 4000,
      rng: seeded(7),
    });
    expect(res.winProb["p0"]!).toBeGreaterThan(res.winProb["p3"]!);
  });

  it("is deterministic for a fixed seed", () => {
    const a = simulateTournament(players([1600, 1500, 1400, 1300]), cfg, {
      runs: 1000,
      rng: seeded(42),
    });
    const b = simulateTournament(players([1600, 1500, 1400, 1300]), cfg, {
      runs: 1000,
      rng: seeded(42),
    });
    expect(a.winProb).toEqual(b.winProb);
  });

  it("reachProb champion equals winProb", () => {
    const res = simulateTournament(players([1600, 1500, 1400, 1300]), cfg, {
      runs: 1000,
      rng: seeded(3),
    });
    expect(res.reachProb["p0"]![4]).toBeCloseTo(res.winProb["p0"]!, 10);
  });

  it("reports convergence series whose tail approaches winProb", () => {
    const res = simulateTournament(players([1800, 1500, 1500, 1200]), cfg, {
      runs: 3000,
      rng: seeded(9),
    });
    expect(res.convergence.length).toBeGreaterThan(0);
    const top = res.convergence[0]!;
    expect(top.series.length).toBeGreaterThan(0);
    const last = top.series[top.series.length - 1]!;
    expect(last).toBeCloseTo(res.winProb[top.id]!, 5);
  });
});
