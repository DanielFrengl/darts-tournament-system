import { describe, it, expect } from "vitest";
import { seedBracket, type GroupAdvancers } from "@/lib/bracket";

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
