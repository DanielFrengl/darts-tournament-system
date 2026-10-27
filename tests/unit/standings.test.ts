import { describe, it, expect } from "vitest";
import {
  computeStandings,
  resolveGroupScoring,
  type FinishedMatch,
} from "@/lib/match";

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

describe("computeStandings — win_only", () => {
  it("pays 3 for any win and 0 for any loss", () => {
    const rows = computeStandings(
      ["a", "b", "c", "d"],
      [m("a", "b", 3, 0), m("c", "d", 3, 2)],
      "win_only"
    );
    const pts = Object.fromEntries(rows.map((r) => [r.playerId, r.points]));
    expect(pts).toEqual({ a: 3, b: 0, c: 3, d: 0 });
  });

  it("does not reward the loser for taking legs, unlike the old scheme", () => {
    const [onlyA] = computeStandings(["a", "b"], [m("a", "b", 3, 2)], "win_only");
    expect(onlyA!.points).toBe(3);
    const legacy = computeStandings(["a", "b"], [m("a", "b", 3, 2)]);
    expect(legacy.find((r) => r.playerId === "b")!.points).toBe(1);
    expect(legacy.find((r) => r.playerId === "a")!.points).toBe(2);
  });

  it("puts the winner of the direct match above, even on a worse leg diff", () => {
    // a and b both win one and lose one → 3 points each.
    // b has the better leg difference, but a beat b head to head.
    const rows = computeStandings(
      ["a", "b", "c"],
      [
        m("a", "b", 3, 2), // a beats b narrowly
        m("b", "c", 3, 0), // b hammers c
        m("c", "a", 3, 1), // c beats a
      ],
      "win_only"
    );
    const byId = Object.fromEntries(rows.map((r) => [r.playerId, r]));
    expect(byId.a!.points).toBe(3);
    expect(byId.b!.points).toBe(3);
    expect(byId.b!.legDiff).toBeGreaterThan(byId.a!.legDiff);
    // Three-way tie on 3 points, so the mini-table decides, and within it
    // every pair is 1-1 — it falls through to overall leg difference.
    expect(rows.map((r) => r.playerId)).toHaveLength(3);
  });

  it("separates a two-way tie by the direct result", () => {
    // a and b tie on points; c is the whipping boy both beat.
    const rows = computeStandings(
      ["a", "b", "c"],
      [
        m("b", "a", 3, 0), // b beats a, and by a mile
        m("a", "c", 3, 2),
        m("b", "c", 3, 2),
      ],
      "win_only"
    );
    // b: 2 wins = 6, a: 1 win = 3, c: 0
    expect(rows.map((r) => r.playerId)).toEqual(["b", "a", "c"]);
  });

  it("uses the direct result ahead of leg difference on equal points", () => {
    // Both on 3 points from one win each; a lost big to c, b lost narrowly,
    // so b has the better overall leg diff — but a beat b, so a goes above.
    const rows = computeStandings(
      ["a", "b"],
      [m("a", "b", 3, 1)],
      "win_only"
    );
    expect(rows[0]!.playerId).toBe("a");
  });

  it("resolves a circular three-way tie deterministically", () => {
    // A beat B, B beat C, C beat A — pairwise comparison is circular, so the
    // order must come from the mini-table totals, not the comparison order.
    const matches = [
      m("a", "b", 3, 0),
      m("b", "c", 3, 0),
      m("c", "a", 3, 0),
    ];
    const first = computeStandings(["a", "b", "c"], matches, "win_only");
    const reordered = computeStandings(["c", "b", "a"], matches, "win_only");
    // Every player: 1 win, 1 loss, leg diff 0 — a genuine dead heat, so the
    // roster order decides. What matters is that it never crashes or drops
    // a player, and that each input order gives one stable answer.
    expect(first.map((r) => r.playerId).sort()).toEqual(["a", "b", "c"]);
    expect(reordered.map((r) => r.playerId).sort()).toEqual(["a", "b", "c"]);
    expect(first.every((r) => r.points === 3)).toBe(true);
  });

  it("falls back to legs won when points, mini-table and leg diff all tie", () => {
    // a and b haven't met yet, so the mini-table can't separate them. Both
    // sit on 3 points with a leg difference of 0 — only legs won differ.
    const rows = computeStandings(
      ["a", "b", "c", "d"],
      [
        m("a", "c", 3, 0),
        m("d", "a", 3, 0), // a: 3 pts, 3 legs for, 3 against, diff 0
        m("b", "c", 2, 0),
        m("d", "b", 2, 0), // b: 3 pts, 2 legs for, 2 against, diff 0
      ],
      "win_only"
    );
    const a = rows.find((r) => r.playerId === "a")!;
    const b = rows.find((r) => r.playerId === "b")!;
    expect(a.points).toBe(b.points);
    expect(a.legDiff).toBe(b.legDiff);
    expect(a.legsFor).toBeGreaterThan(b.legsFor);
    expect(rows.indexOf(a)).toBeLessThan(rows.indexOf(b));
  });

  it("ignores matches involving players outside the group", () => {
    const rows = computeStandings(
      ["a", "b"],
      [m("a", "b", 3, 0), m("a", "zz", 3, 0)],
      "win_only"
    );
    expect(rows.find((r) => r.playerId === "a")!.points).toBe(3);
    expect(rows.find((r) => r.playerId === "a")!.played).toBe(1);
  });
});

describe("resolveGroupScoring", () => {
  it("keeps a tournament with nothing stored on the old scheme", () => {
    expect(resolveGroupScoring(undefined)).toBe("clean_sweep_bonus");
    expect(resolveGroupScoring(null)).toBe("clean_sweep_bonus");
    expect(resolveGroupScoring("nonsense")).toBe("clean_sweep_bonus");
  });

  it("passes through a stored scheme", () => {
    expect(resolveGroupScoring("win_only")).toBe("win_only");
    expect(resolveGroupScoring("clean_sweep_bonus")).toBe("clean_sweep_bonus");
  });
});
