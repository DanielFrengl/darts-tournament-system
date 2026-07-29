import { z } from "zod";
import {
  DEFAULT_MAX_ODDS,
  DEFAULT_MIN_ODDS,
  DEFAULT_ODDS_SEED_POOL,
} from "@/lib/odds";

const OddBestOf = z
  .number()
  .int()
  .min(1)
  .max(15)
  .refine((n) => n % 2 === 1, { message: "best_of must be odd" });

export const TournamentConfigSchema = z
  .object({
    groupCount: z.number().int().min(1).max(8),
    groupSize: z.number().int().min(2).max(16),
    advancePerGroup: z.number().int().min(1).max(16),
    bestOfGroup: OddBestOf,
    bestOfQuarter: OddBestOf,
    bestOfSemi: OddBestOf,
    bestOfFinal: OddBestOf,
    thirdPlaceMatch: z.boolean(),
    crossSeedingPattern: z.enum(["standard"]),
    startingCapital: z.number().min(0).max(1_000_000),
    parimutuelThreshold: z.number().min(0).max(1_000_000),
    houseEdge: z.number().min(0).max(0.1),
    // Virtual pool each selection is seeded with, in jablka. Bigger =
    // kurz reacts more slowly to incoming money. 0 disables seeding.
    oddsSeedPool: z.number().min(0).max(1_000_000).default(500),
    // Hard band the published kurz is held inside.
    minOdds: z.number().min(1.01).max(2).default(1.1),
    maxOdds: z.number().min(2).max(1000).default(25),
    totalLegsLineDelta: z.number().min(0).max(10),
    triple20sLine: z.number().min(0).max(10_000),
    enabledMarkets: z.array(z.string()).min(1),
  })
  .refine((c) => c.advancePerGroup <= c.groupSize, {
    message: "advancePerGroup must not exceed groupSize",
  })
  .refine((c) => c.advancePerGroup * c.groupCount >= 2, {
    message: "at least 2 players must advance to playoff",
  })
  .refine(
    (c) => {
      const total = c.advancePerGroup * c.groupCount;
      return total === 2 || total === 4 || total === 8;
    },
    {
      message:
        "Celkový počet postupujících musí být 2, 4 nebo 8 (mocnina dvou). " +
        "Uprav počet skupin × postupujících (např. 2×2=4, 2×4=8).",
      path: ["advancePerGroup"],
    }
  )
  .refine((c) => c.groupCount === 2 || c.groupCount === 4 || c.advancePerGroup * c.groupCount === 2, {
    message: "Aktuálně podporujeme 2 nebo 4 skupiny v playoffu",
    path: ["groupCount"],
  })
  .refine((c) => c.maxOdds > c.minOdds, {
    message: "maxOdds musí být větší než minOdds",
    path: ["maxOdds"],
  });

export type TournamentConfig = z.infer<typeof TournamentConfigSchema>;

export function defaultTournamentConfig(): TournamentConfig {
  return {
    groupCount: 2,
    groupSize: 4,
    advancePerGroup: 2,
    bestOfGroup: 3,
    bestOfQuarter: 5,
    bestOfSemi: 5,
    bestOfFinal: 7,
    thirdPlaceMatch: false,
    crossSeedingPattern: "standard",
    startingCapital: 1000,
    parimutuelThreshold: 5000,
    houseEdge: 0,
    oddsSeedPool: 500,
    minOdds: 1.1,
    maxOdds: 25,
    totalLegsLineDelta: 0.5,
    triple20sLine: 50,
    enabledMarkets: [
      "match_winner",
      "correct_score",
      "leg_winner",
      "total_legs",
      "tournament_winner",
      "group_winner",
      "reach_playoff",
      "reach_final",
      "podium_finish",
    ],
  };
}

export type OddsBalanceConfig = {
  seedPool: number;
  minOdds: number;
  maxOdds: number;
  houseEdge: number;
  parimutuelThreshold: number;
};

/**
 * Read the odds-balancing knobs off a tournament config.
 *
 * Tournaments created before these knobs existed have a configJson without
 * them, and the read path casts rather than parses, so the values arrive as
 * undefined at runtime. Fill them in here instead of letting NaN reach the
 * odds math and write a garbage kurz to the database.
 */
export function resolveOddsConfig(
  cfg: Partial<TournamentConfig> | null | undefined
): OddsBalanceConfig {
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const minOdds = num(cfg?.minOdds, DEFAULT_MIN_ODDS);
  const maxOdds = num(cfg?.maxOdds, DEFAULT_MAX_ODDS);
  return {
    seedPool: Math.max(0, num(cfg?.oddsSeedPool, DEFAULT_ODDS_SEED_POOL)),
    minOdds,
    // never hand clampOdds an inverted band
    maxOdds: Math.max(maxOdds, minOdds),
    houseEdge: num(cfg?.houseEdge, 0),
    parimutuelThreshold: num(cfg?.parimutuelThreshold, 5000),
  };
}

export const TournamentCreateSchema = z.object({
  name: z.string().min(1).max(100),
  config: TournamentConfigSchema,
});
export type TournamentCreateInput = z.infer<typeof TournamentCreateSchema>;
