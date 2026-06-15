import { describe, it, expect } from "vitest";
import {
  seedBracket,
  semifinalOfQuarter,
  type GroupAdvancers,
} from "@/lib/bracket";

describe("seedBracket", () => {
  it("4 advancers (2x2) → semifinals A1 vs B2, B1 vs A2", () => {
    const advancers: GroupAdvancers[] = [
      { groupName: "A", players: ["a1", "a2"] },
      { groupName: "B", players: ["b1", "b2"] },
    ];
    const matches = seedBracket(advancers);
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({
      phase: "semi",
      bracketRound: 1,
      bracketPosition: 0,
      playerAId: "a1",
      playerBId: "b2",
    });
    expect(matches[1]).toMatchObject({
      phase: "semi",
      bracketRound: 1,
      bracketPosition: 1,
      playerAId: "b1",
      playerBId: "a2",
    });
  });

  it("8 advancers (2x4) → quarterfinals first round", () => {
    const advancers: GroupAdvancers[] = [
      { groupName: "A", players: ["a1", "a2", "a3", "a4"] },
      { groupName: "B", players: ["b1", "b2", "b3", "b4"] },
    ];
    const matches = seedBracket(advancers);
    expect(matches).toHaveLength(4);
    expect(matches.every((m) => m.phase === "quarter")).toBe(true);
    expect(matches[0]?.playerAId).toBe("a1");
    expect(matches[0]?.playerBId).toBe("b4");
  });

  it("4 advancers (4x1) → semifinals A1 vs C1, B1 vs D1", () => {
    const advancers: GroupAdvancers[] = [
      { groupName: "A", players: ["a1"] },
      { groupName: "B", players: ["b1"] },
      { groupName: "C", players: ["c1"] },
      { groupName: "D", players: ["d1"] },
    ];
    const matches = seedBracket(advancers);
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({
      phase: "semi",
      bracketRound: 1,
      bracketPosition: 0,
      playerAId: "a1",
      playerBId: "c1",
    });
    expect(matches[1]).toMatchObject({
      phase: "semi",
      bracketRound: 1,
      bracketPosition: 1,
      playerAId: "b1",
      playerBId: "d1",
    });
  });

  it("8 advancers (4x2) → quarterfinals", () => {
    const advancers: GroupAdvancers[] = [
      { groupName: "A", players: ["a1", "a2"] },
      { groupName: "B", players: ["b1", "b2"] },
      { groupName: "C", players: ["c1", "c2"] },
      { groupName: "D", players: ["d1", "d2"] },
    ];
    const matches = seedBracket(advancers);
    expect(matches).toHaveLength(4);
    expect(matches.every((m) => m.phase === "quarter")).toBe(true);
    expect(matches[0]).toMatchObject({ playerAId: "a1", playerBId: "b2" });
    expect(matches[1]).toMatchObject({ playerAId: "c1", playerBId: "d2" });
    expect(matches[2]).toMatchObject({ playerAId: "b1", playerBId: "a2" });
    expect(matches[3]).toMatchObject({ playerAId: "d1", playerBId: "c2" });
  });

  it("single group with 2 advancers → a direct final", () => {
    const advancers: GroupAdvancers[] = [
      { groupName: "A", players: ["a1", "a2"] },
    ];
    const matches = seedBracket(advancers);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      phase: "final",
      bracketRound: 1,
      bracketPosition: 0,
      playerAId: "a1",
      playerBId: "a2",
    });
  });

  it("4 groups never pit two players from the same group against each other in round 1", () => {
    const advancers: GroupAdvancers[] = [
      { groupName: "A", players: ["a1", "a2"] },
      { groupName: "B", players: ["b1", "b2"] },
      { groupName: "C", players: ["c1", "c2"] },
      { groupName: "D", players: ["d1", "d2"] },
    ];
    const groupOf = (id: string) => id[0];
    for (const m of seedBracket(advancers)) {
      expect(groupOf(m.playerAId)).not.toBe(groupOf(m.playerBId));
    }
  });

  it("4 groups: no two players from the same group can reach the same semifinal", () => {
    // 4 groups of 3 players, top 2 advance → 8-player quarterfinal bracket.
    const advancers: GroupAdvancers[] = [
      { groupName: "A", players: ["a1", "a2"] },
      { groupName: "B", players: ["b1", "b2"] },
      { groupName: "C", players: ["c1", "c2"] },
      { groupName: "D", players: ["d1", "d2"] },
    ];
    const groupOf = (id: string) => id[0];
    const quarters = seedBracket(advancers);
    expect(quarters).toHaveLength(4);

    // Quarterfinal winners are paired into semifinals as
    // (pos0,pos1)->semi0, (pos2,pos3)->semi1. Enumerate every possible
    // outcome (2^4 winner combinations) and assert no semifinal ever pits
    // two players from the same group against each other.
    const sorted = [...quarters].sort(
      (x, y) => x.bracketPosition - y.bracketPosition
    );
    for (let mask = 0; mask < 1 << sorted.length; mask++) {
      const winners = sorted.map((m, i) =>
        mask & (1 << i) ? m.playerAId : m.playerBId
      );
      const semifinals = new Map<number, string[]>();
      sorted.forEach((m, i) => {
        const semi = semifinalOfQuarter(m.bracketPosition);
        const slot = semifinals.get(semi) ?? [];
        slot.push(winners[i]!);
        semifinals.set(semi, slot);
      });
      for (const players of semifinals.values()) {
        expect(players).toHaveLength(2);
        expect(groupOf(players[0]!)).not.toBe(groupOf(players[1]!));
      }
    }
  });

  it("semifinalOfQuarter maps adjacent quarterfinals to the same semifinal", () => {
    expect(semifinalOfQuarter(0)).toBe(0);
    expect(semifinalOfQuarter(1)).toBe(0);
    expect(semifinalOfQuarter(2)).toBe(1);
    expect(semifinalOfQuarter(3)).toBe(1);
  });

  it("4 groups produce contiguous bracket positions starting at 0", () => {
    const advancers: GroupAdvancers[] = [
      { groupName: "A", players: ["a1", "a2"] },
      { groupName: "B", players: ["b1", "b2"] },
      { groupName: "C", players: ["c1", "c2"] },
      { groupName: "D", players: ["d1", "d2"] },
    ];
    const positions = seedBracket(advancers)
      .map((m) => m.bracketPosition)
      .sort((a, b) => a - b);
    expect(positions).toEqual([0, 1, 2, 3]);
  });

  it("throws for 4 groups advancing an unequal number of players", () => {
    const advancers: GroupAdvancers[] = [
      { groupName: "A", players: ["a1", "a2"] },
      { groupName: "B", players: ["b1", "b2"] },
      { groupName: "C", players: ["c1", "c2"] },
      { groupName: "D", players: ["d1"] },
    ];
    expect(() => seedBracket(advancers)).toThrow();
  });

  it("throws for 4 groups with more than 2 advancers each (16 total unsupported)", () => {
    const advancers: GroupAdvancers[] = ["A", "B", "C", "D"].map((g) => ({
      groupName: g,
      players: [`${g}1`, `${g}2`, `${g}3`, `${g}4`],
    }));
    expect(() => seedBracket(advancers)).toThrow();
  });

  it("throws for 3 groups", () => {
    const advancers: GroupAdvancers[] = [
      { groupName: "A", players: ["a1", "a2"] },
      { groupName: "B", players: ["b1", "b2"] },
      { groupName: "C", players: ["c1", "c2"] },
    ];
    expect(() => seedBracket(advancers)).toThrow();
  });

  it("throws when fewer than 2 advancers", () => {
    const advancers: GroupAdvancers[] = [{ groupName: "A", players: ["only"] }];
    expect(() => seedBracket(advancers)).toThrow();
  });

  it("throws when total advancers is odd", () => {
    const advancers: GroupAdvancers[] = [
      { groupName: "A", players: ["a1", "a2"] },
      { groupName: "B", players: ["b1"] },
    ];
    expect(() => seedBracket(advancers)).toThrow();
  });

  it("throws when total advancers is not a power of 2", () => {
    const advancers: GroupAdvancers[] = [
      { groupName: "A", players: ["a1", "a2", "a3"] },
      { groupName: "B", players: ["b1", "b2", "b3"] },
    ];
    expect(() => seedBracket(advancers)).toThrow();
  });
});
