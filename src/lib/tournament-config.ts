import { z } from "zod";

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
    maxStakePct: z.number().gt(0).lte(1),
    parimutuelThreshold: z.number().min(0).max(1_000_000),
    houseEdge: z.number().min(0).max(0.1),
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
      return total === 2 || total === 4 || total === 8 || total === 16;
    },
    {
      message:
        "Celkový počet postupujících musí být 2, 4, 8 nebo 16 (mocnina dvou). " +
        "Uprav počet skupin × postupujících (např. 2×2=4, 2×4=8).",
      path: ["advancePerGroup"],
    }
  )
  .refine((c) => c.groupCount === 2 || c.advancePerGroup * c.groupCount === 2, {
    message: "Aktuálně podporujeme jen 2 skupiny v playoffu",
    path: ["groupCount"],
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
    maxStakePct: 0.5,
    parimutuelThreshold: 5000,
    houseEdge: 0,
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

export const TournamentCreateSchema = z.object({
  name: z.string().min(1).max(100),
  config: TournamentConfigSchema,
});
export type TournamentCreateInput = z.infer<typeof TournamentCreateSchema>;
