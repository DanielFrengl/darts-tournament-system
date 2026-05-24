import { describe, it, expect } from "vitest";
import { computeStandings, type FinishedMatch } from "@/lib/match";

const m = (a: string, b: string, sa: number, sb: number): FinishedMatch => ({
  playerAId: a,
  playerBId: b,
  scoreA: sa,
  scoreB: sb,
});

describe("computeStandings", () => {
  it("2:0 win awards 3 points, 0:2 loss awards 0", () => {
    const s = computeStandings(["a", "b"], [m("a", "b", 2, 0)]);
    expect(s[0]).toMatchObject({ playerId: "a", points: 3, played: 1, won: 1, lost: 0 });
    expect(s[1]).toMatchObject({ playerId: "b", points: 0, played: 1, won: 0, lost: 1 });
  });

  it("2:1 win awards 2 points, 1:2 loss awards 1", () => {
    const s = computeStandings(["a", "b"], [m("a", "b", 2, 1)]);
    expect(s[0]).toMatchObject({ playerId: "a", points: 2 });
    expect(s[1]).toMatchObject({ playerId: "b", points: 1 });
  });

  it("orders by points desc; both losers tied at 2 pts (one 2:1 win + one 1:2 loss each)", () => {
    const matches: FinishedMatch[] = [
      m("a", "b", 2, 0),
      m("a", "c", 2, 1),
      m("b", "c", 2, 1),
    ];
    const s = computeStandings(["a", "b", "c"], matches);
    expect(s.map((x) => x.playerId)[0]).toBe("a");
    expect(s[0]?.points).toBe(5);
    expect(s[1]?.points).toBe(2);
    expect(s[2]?.points).toBe(2);
  });

  it("breaks tie on equal points by leg diff", () => {
    const matches: FinishedMatch[] = [
      m("a", "b", 2, 0),
      m("c", "b", 2, 1),
      m("c", "a", 2, 1),
    ];
    const s = computeStandings(["a", "b", "c"], matches);
    expect(s[0]?.playerId).toBe("c");
    expect(s[0]?.points).toBe(4);
    expect(s[1]?.points).toBe(4);
    expect(s[1]?.playerId).toBe("a");
    expect(s[2]?.points).toBe(1);
    expect(s[0]!.legDiff).toBeGreaterThan(s[1]!.legDiff);
  });

  it("breaks tie on equal points + leg diff by head-to-head", () => {
    const matches: FinishedMatch[] = [m("a", "b", 2, 0), m("b", "a", 2, 0)];
    const s = computeStandings(["a", "b"], matches);
    expect(s).toHaveLength(2);
    expect(s[0]?.points).toBe(3);
    expect(s[1]?.points).toBe(3);
  });

  it("ignores matches not involving the given players", () => {
    const matches: FinishedMatch[] = [m("x", "y", 2, 0), m("a", "b", 2, 1)];
    const s = computeStandings(["a", "b"], matches);
    expect(s).toHaveLength(2);
    expect(s[0]?.played).toBe(1);
  });

  it("zero matches → all standings have played=0", () => {
    const s = computeStandings(["a", "b", "c"], []);
    expect(s.every((x) => x.played === 0)).toBe(true);
  });
});
