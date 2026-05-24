import { describe, it, expect } from "vitest";
import { generateRoundRobin } from "@/lib/match";

describe("generateRoundRobin", () => {
  it("returns no pairings for 0 or 1 players", () => {
    expect(generateRoundRobin([])).toEqual([]);
    expect(generateRoundRobin(["a"])).toEqual([]);
  });

  it("for 4 players returns 6 pairings (n*(n-1)/2)", () => {
    const pairs = generateRoundRobin(["a", "b", "c", "d"]);
    expect(pairs).toHaveLength(6);
  });

  it("for 4 players each pair appears exactly once", () => {
    const pairs = generateRoundRobin(["a", "b", "c", "d"]);
    const keys = pairs.map(([x, y]) => [x, y].sort().join("-")).sort();
    expect(keys).toEqual(["a-b", "a-c", "a-d", "b-c", "b-d", "c-d"]);
  });

  it("for 5 players returns 10 pairings", () => {
    const pairs = generateRoundRobin(["a", "b", "c", "d", "e"]);
    expect(pairs).toHaveLength(10);
  });

  it("for 5 players each pair appears exactly once", () => {
    const pairs = generateRoundRobin(["a", "b", "c", "d", "e"]);
    const keys = new Set(pairs.map(([x, y]) => [x, y].sort().join("-")));
    expect(keys.size).toBe(10);
  });

  it("for 3 players returns 3 pairings", () => {
    expect(generateRoundRobin(["a", "b", "c"])).toHaveLength(3);
  });

  it("no pairing has the same player twice", () => {
    const pairs = generateRoundRobin(["a", "b", "c", "d", "e", "f"]);
    for (const [x, y] of pairs) {
      expect(x).not.toBe(y);
    }
  });
});
