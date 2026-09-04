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

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

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
    const champion = res.stages.length - 1;
    expect(res.reachProb["p0"]![champion]).toBeCloseTo(res.winProb["p0"]!, 10);
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

  describe("stages", () => {
    it("reports only the rounds the bracket actually has", () => {
      // 2 groups x 1 advancer: the two qualifiers meet straight in the final.
      const twoUp = simulateTournament(players([1600, 1500, 1400, 1300]), cfg, {
        runs: 200,
        rng: seeded(11),
      });
      expect(twoUp.stages).toEqual(["group", "final", "champion"]);

      // 2 groups x 2 advancers: a four-player playoff — semifinals, no quarters.
      const fourUp = simulateTournament(
        players([1600, 1550, 1500, 1450, 1400, 1350, 1300, 1250]),
        { ...cfg, groupSize: 4, advancePerGroup: 2 },
        { runs: 200, rng: seeded(12) }
      );
      expect(fourUp.stages).toEqual(["group", "semi", "final", "champion"]);

      // 4 groups x 2 advancers: a full eight-player playoff.
      const eightUp = simulateTournament(
        players([1600, 1550, 1500, 1450, 1400, 1350, 1300, 1250]),
        { ...cfg, groupCount: 4, groupSize: 2, advancePerGroup: 2 },
        { runs: 200, rng: seeded(13) }
      );
      expect(eightUp.stages).toEqual([
        "group",
        "quarter",
        "semi",
        "final",
        "champion",
      ]);
    });

    it("sizes reachProb and placeDist to the stages it reports", () => {
      const res = simulateTournament(
        players([1600, 1550, 1500, 1450, 1400, 1350, 1300, 1250]),
        { ...cfg, groupSize: 4, advancePerGroup: 2 },
        { runs: 1000, rng: seeded(14) }
      );
      for (const id of Object.keys(res.winProb)) {
        expect(res.reachProb[id]).toHaveLength(res.stages.length);
        expect(res.placeDist[id]).toHaveLength(res.stages.length);
        // Everyone plays the group stage, and everyone finishes somewhere.
        expect(res.reachProb[id]![0]).toBeCloseTo(1, 10);
        expect(sum(res.placeDist[id]!)).toBeCloseTo(1, 10);
      }
    });

    it("keeps reachProb monotone and consistent with placeDist", () => {
      const res = simulateTournament(
        players([1800, 1700, 1600, 1500, 1400, 1300, 1200, 1100]),
        { ...cfg, groupCount: 4, groupSize: 2, advancePerGroup: 2 },
        { runs: 2000, rng: seeded(15) }
      );
      const stages = res.stages.length;
      for (const id of Object.keys(res.winProb)) {
        const reach = res.reachProb[id]!;
        const place = res.placeDist[id]!;
        for (let s = 1; s < stages; s++) {
          expect(reach[s]!).toBeLessThanOrEqual(reach[s - 1]! + 1e-12);
        }
        // Reaching stage s means finishing in one of the s-or-better buckets,
        // and the buckets run best-first.
        for (let s = 0; s < stages; s++) {
          expect(reach[s]!).toBeCloseTo(sum(place.slice(0, stages - s)), 10);
        }
      }
    });
  });

  describe("third place", () => {
    it("splits an undecided third place evenly instead of by bracket slot", () => {
      // Eight identical players, four-man playoff, no third-place match.
      // Nothing distinguishes anyone, so third place has to land uniformly.
      // Awarding it to a fixed bracket slot would pile it onto whoever drew
      // the top half.
      const res = simulateTournament(
        players([1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500]),
        { ...cfg, groupSize: 4, advancePerGroup: 2, thirdPlaceMatch: false },
        { runs: 20000, rng: seeded(21) }
      );
      const thirds = Object.values(res.thirdProb);
      expect(sum(thirds)).toBeCloseTo(1, 10);
      for (const p of thirds) expect(p).toBeGreaterThan(0.1);
      expect(Math.max(...thirds) - Math.min(...thirds)).toBeLessThan(0.03);
    });

    it("gives the stronger beaten semifinalist third place more often when it is played out", () => {
      const res = simulateTournament(
        players([1900, 1500, 1500, 1100, 1500, 1500, 1500, 1500]),
        { ...cfg, groupSize: 4, advancePerGroup: 2, thirdPlaceMatch: true },
        { runs: 8000, rng: seeded(22) }
      );
      expect(sum(Object.values(res.thirdProb))).toBeCloseTo(1, 10);
      expect(res.thirdProb["p0"]!).toBeGreaterThan(res.thirdProb["p3"]!);
    });
  });

  describe("group draw", () => {
    const strongWeak = players([1900, 1900, 1100, 1100]);

    it("keeps a draw that has already happened", () => {
      // Both favorites are stuck in group A, so exactly one of them goes
      // through and a 1100 always takes the other final slot.
      const res = simulateTournament(strongWeak, cfg, {
        runs: 4000,
        rng: seeded(31),
        draw: [
          ["p0", "p1"],
          ["p2", "p3"],
        ],
      });
      const final = res.stages.indexOf("final");
      expect(res.reachProb["p2"]![final]! + res.reachProb["p3"]![final]!).toBeCloseTo(
        1,
        10
      );
      expect(res.reachProb["p0"]![final]! + res.reachProb["p1"]![final]!).toBeCloseTo(
        1,
        10
      );
    });

    it("re-draws groups when no draw is given", () => {
      // Random groups split the favorites two thirds of the time, so a 1100
      // reaches the final far less often than under the draw above.
      const res = simulateTournament(strongWeak, cfg, {
        runs: 4000,
        rng: seeded(31),
      });
      const final = res.stages.indexOf("final");
      const weakReach = res.reachProb["p2"]![final]! + res.reachProb["p3"]![final]!;
      expect(weakReach).toBeGreaterThan(0.2);
      expect(weakReach).toBeLessThan(0.5);
    });

    it("ignores a draw that no longer matches the field", () => {
      const withStale = simulateTournament(strongWeak, cfg, {
        runs: 500,
        rng: seeded(33),
        draw: [["p0", "p1"], ["p2"]], // p3 missing
      });
      const withNone = simulateTournament(strongWeak, cfg, {
        runs: 500,
        rng: seeded(33),
      });
      expect(withStale.winProb).toEqual(withNone.winProb);
    });
  });

  it("survives a config with no match length recorded", () => {
    // Tournaments created before the lengths were configurable read back
    // without them; a NaN target used to end every match at 0:0.
    const legacy = { ...cfg, bestOfGroup: undefined, bestOfFinal: undefined } as unknown as SimConfig;
    const res = simulateTournament(players([1800, 1500, 1500, 1200]), legacy, {
      runs: 500,
      rng: seeded(41),
    });
    expect(sum(Object.values(res.winProb))).toBeCloseTo(1, 10);
    expect(res.winProb["p0"]!).toBeGreaterThan(res.winProb["p3"]!);
  });
});
