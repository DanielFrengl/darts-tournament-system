import { describe, it, expect } from "vitest";
import {
  TournamentConfigSchema,
  defaultTournamentConfig,
  TournamentCreateSchema,
  resolveOddsConfig,
} from "@/lib/tournament-config";
import { seedBracket, type GroupAdvancers } from "@/lib/bracket";

describe("defaultTournamentConfig", () => {
  it("returns a config that passes its own schema", () => {
    const cfg = defaultTournamentConfig();
    expect(TournamentConfigSchema.safeParse(cfg).success).toBe(true);
  });

  it("has 2 groups of 4 with top-2 advancing", () => {
    const cfg = defaultTournamentConfig();
    expect(cfg.groupCount).toBe(2);
    expect(cfg.groupSize).toBe(4);
    expect(cfg.advancePerGroup).toBe(2);
  });

  it("has best-of progression 3/5/5/7", () => {
    const cfg = defaultTournamentConfig();
    expect(cfg.bestOfGroup).toBe(3);
    expect(cfg.bestOfQuarter).toBe(5);
    expect(cfg.bestOfSemi).toBe(5);
    expect(cfg.bestOfFinal).toBe(7);
  });
});

describe("TournamentConfigSchema", () => {
  it("rejects even bestOf values", () => {
    const cfg = { ...defaultTournamentConfig(), bestOfGroup: 4 };
    expect(TournamentConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it("rejects groupCount < 1", () => {
    const cfg = { ...defaultTournamentConfig(), groupCount: 0 };
    expect(TournamentConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it("rejects advancePerGroup > groupSize", () => {
    const cfg = { ...defaultTournamentConfig(), advancePerGroup: 5, groupSize: 4 };
    expect(TournamentConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it("accepts 4 groups with 1 advancing (4 total -> semi)", () => {
    const cfg = { ...defaultTournamentConfig(), groupCount: 4, groupSize: 4, advancePerGroup: 1 };
    expect(TournamentConfigSchema.safeParse(cfg).success).toBe(true);
  });

  it("accepts 4 groups with 2 advancing (8 total -> quarter)", () => {
    const cfg = { ...defaultTournamentConfig(), groupCount: 4, groupSize: 4, advancePerGroup: 2 };
    expect(TournamentConfigSchema.safeParse(cfg).success).toBe(true);
  });

  it("rejects 4 groups with 4 advancing (16 total -> unsupported)", () => {
    const cfg = { ...defaultTournamentConfig(), groupCount: 4, groupSize: 4, advancePerGroup: 4 };
    expect(TournamentConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it("rejects 3 groups", () => {
    const cfg = { ...defaultTournamentConfig(), groupCount: 3, advancePerGroup: 2 };
    expect(TournamentConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it("rejects negative starting capital", () => {
    const cfg = { ...defaultTournamentConfig(), startingCapital: -1 };
    expect(TournamentConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it("rejects house_edge outside [0, 0.1]", () => {
    const cfg = { ...defaultTournamentConfig(), houseEdge: 0.2 };
    expect(TournamentConfigSchema.safeParse(cfg).success).toBe(false);
  });
});

describe("config ↔ bracket consistency", () => {
  // Any group config the schema accepts must produce a bracket the
  // generator can actually seed — otherwise creation throws at runtime.
  it("every schema-accepted group config can be seeded", () => {
    for (let groupCount = 1; groupCount <= 8; groupCount++) {
      for (let advancePerGroup = 1; advancePerGroup <= 4; advancePerGroup++) {
        const cfg = {
          ...defaultTournamentConfig(),
          groupCount,
          groupSize: 4,
          advancePerGroup,
        };
        if (!TournamentConfigSchema.safeParse(cfg).success) continue;

        const advancers: GroupAdvancers[] = Array.from(
          { length: groupCount },
          (_, g) => ({
            groupName: String.fromCharCode(65 + g),
            players: Array.from(
              { length: advancePerGroup },
              (_, p) => `g${g}p${p}`
            ),
          })
        );
        expect(
          () => seedBracket(advancers),
          `groupCount=${groupCount} advancePerGroup=${advancePerGroup}`
        ).not.toThrow();
      }
    }
  });
});

describe("TournamentCreateSchema", () => {
  it("requires non-empty name", () => {
    expect(
      TournamentCreateSchema.safeParse({ name: "", config: defaultTournamentConfig() }).success
    ).toBe(false);
  });

  it("accepts valid create payload", () => {
    expect(
      TournamentCreateSchema.safeParse({
        name: "Spring Cup",
        config: defaultTournamentConfig(),
      }).success
    ).toBe(true);
  });
});

describe("resolveOddsConfig", () => {
  it("reads the knobs off a full config", () => {
    const cfg = defaultTournamentConfig();
    const odds = resolveOddsConfig(cfg);
    expect(odds.seedPool).toBe(500);
    expect(odds.minOdds).toBeCloseTo(1.1, 6);
    expect(odds.maxOdds).toBe(25);
  });

  it("fills in defaults for a config written before the knobs existed", () => {
    const legacy = { ...defaultTournamentConfig() } as Record<string, unknown>;
    delete legacy.oddsSeedPool;
    delete legacy.minOdds;
    delete legacy.maxOdds;
    const odds = resolveOddsConfig(legacy as never);
    expect(odds.seedPool).toBe(500);
    expect(odds.minOdds).toBeCloseTo(1.1, 6);
    expect(odds.maxOdds).toBe(25);
  });

  it("survives null and undefined config", () => {
    expect(resolveOddsConfig(null).seedPool).toBe(500);
    expect(resolveOddsConfig(undefined).maxOdds).toBe(25);
  });

  it("never returns an inverted band", () => {
    const odds = resolveOddsConfig({ minOdds: 5, maxOdds: 2 } as never);
    expect(odds.maxOdds).toBeGreaterThanOrEqual(odds.minOdds);
  });

  it("schema rejects maxOdds below minOdds", () => {
    const cfg = { ...defaultTournamentConfig(), minOdds: 1.5, maxOdds: 1.2 };
    expect(TournamentConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it("schema defaults the knobs when they are absent", () => {
    const cfg = { ...defaultTournamentConfig() } as Record<string, unknown>;
    delete cfg.oddsSeedPool;
    delete cfg.minOdds;
    delete cfg.maxOdds;
    const parsed = TournamentConfigSchema.safeParse(cfg);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.oddsSeedPool).toBe(500);
      expect(parsed.data.maxOdds).toBe(25);
    }
  });
});
