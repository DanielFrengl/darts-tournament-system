import { describe, it, expect } from "vitest";
import { replayElo, type ReplayMatch } from "@/lib/rating-replay";

describe("replayElo", () => {
  it("rewards the consistent winner", () => {
    const matches: ReplayMatch[] = [
      { winner: "A", loser: "B" },
      { winner: "A", loser: "B" },
      { winner: "A", loser: "C" },
    ];
    const ratings = replayElo(["A", "B", "C"], matches);
    expect(ratings["A"]).toBeGreaterThan(1500);
    expect(ratings["B"]).toBeLessThan(1500);
  });

  it("starts everyone at 1500 and respects order of play", () => {
    const ratings = replayElo(["A", "B"], [{ winner: "B", loser: "A" }]);
    expect(ratings["B"]!).toBeGreaterThan(ratings["A"]!);
  });

  it("seeds unseen names at 1500 on first appearance", () => {
    const ratings = replayElo([], [{ winner: "X", loser: "Y" }]);
    expect(ratings["X"]!).toBeGreaterThan(1500);
    expect(ratings["Y"]!).toBeLessThan(1500);
  });
});
