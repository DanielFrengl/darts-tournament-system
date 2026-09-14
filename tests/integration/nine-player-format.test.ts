import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { setupTestDb, truncateAll, teardownTestDb, testDb } from "../setup/db";
import { matches, players, groups, tournaments } from "@/db/schema";
import { TournamentService } from "@/lib/tournament";
import { PlayerService } from "@/lib/player";
import { MatchService } from "@/lib/match";
import { defaultTournamentConfig, TournamentConfigSchema } from "@/lib/tournament-config";
import { recordLegAndAdvance, startLegWithMarkets } from "@/lib/leg";

/**
 * The nine-player night: two asymmetric groups (5 and 4), the top four of
 * each into a quarterfinal bracket. Exactly one player — fifth in the group
 * of five — goes out in the group stage; the group of four is played for
 * seeding, not survival.
 */
const NINE_PLAYER_CONFIG = {
  ...defaultTournamentConfig(),
  groupCount: 2,
  groupSize: 5,
  advancePerGroup: 4,
  bestOfGroup: 3,
  bestOfQuarter: 5,
  bestOfSemi: 5,
  bestOfFinal: 7,
};

const tournamentService = new TournamentService(testDb);
const playerService = new PlayerService(testDb);
const matchService = new MatchService(testDb);

beforeAll(async () => {
  await setupTestDb();
});
beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await teardownTestDb();
});

/** Play a match out, handing every leg to `winnerId`. */
async function winMatch(matchId: string, winnerId: string): Promise<void> {
  const [m] = await testDb.select().from(matches).where(eq(matches.id, matchId));
  const need = Math.ceil(m!.bestOf / 2);
  for (let i = 0; i < need; i++) {
    const leg = await startLegWithMarkets(matchId);
    await recordLegAndAdvance(leg.id, winnerId);
  }
}

/**
 * Play every scheduled match of a phase. `pick` chooses the winner, so a
 * test can drive a deterministic bracket instead of an arbitrary one.
 */
async function playPhase(
  tournamentId: string,
  phase: "group" | "quarter" | "semi" | "final",
  pick: (playerAId: string, playerBId: string) => string
): Promise<number> {
  const rows = await testDb
    .select()
    .from(matches)
    .where(and(eq(matches.tournamentId, tournamentId), eq(matches.phase, phase)));
  for (const m of rows) {
    await winMatch(m.id, pick(m.playerAId!, m.playerBId!));
  }
  return rows.length;
}

async function setupNine() {
  const t = await tournamentService.create({
    name: "Devítka",
    config: NINE_PLAYER_CONFIG,
  });
  const added = [];
  for (let i = 0; i < 9; i++) added.push(await playerService.add(t.id, `P${i}`));
  await playerService.autoAssignRandom(t.id);
  return { t, added };
}

describe("nine players, groups of 5 and 4, top four from each", () => {
  it("accepts the config", () => {
    const parsed = TournamentConfigSchema.safeParse(NINE_PLAYER_CONFIG);
    expect(parsed.success).toBe(true);
  });

  it("draws nine players into groups of 5 and 4", async () => {
    const { t } = await setupNine();
    const byGroup = await playerService.listByGroup(t.id);
    const sizes = [...byGroup.values()].map((ps) => ps.length).sort((a, b) => b - a);
    expect(sizes).toEqual([5, 4]);
    // Nobody is left out of the draw — startGroups refuses unassigned players.
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(9);
  });

  it("generates a full round robin in each group — 10 + 6 matches", async () => {
    const { t } = await setupNine();
    const created = await matchService.generateGroupMatches(t.id);
    expect(created).toBe(16);

    const groupRows = await testDb
      .select()
      .from(groups)
      .where(eq(groups.tournamentId, t.id));
    const counts: number[] = [];
    for (const g of groupRows) {
      const ms = await matchService.listByGroup(g.id);
      counts.push(ms.length);
      // Round robin: every pair in the group meets exactly once.
      const seen = new Set(ms.map((m) => [m.playerAId, m.playerBId].sort().join("|")));
      expect(seen.size).toBe(ms.length);
    }
    expect(counts.sort((a, b) => b - a)).toEqual([10, 6]);
  });

  it("sends four from each group into a cross-seeded quarterfinal", async () => {
    const { t } = await setupNine();
    await matchService.generateGroupMatches(t.id);
    await tournamentService.transition(t.id, "groups");

    // Player A always wins, so the group tables are decided and stable.
    await playPhase(t.id, "group", (a) => a);

    const qf = await testDb
      .select()
      .from(matches)
      .where(and(eq(matches.tournamentId, t.id), eq(matches.phase, "quarter")));
    expect(qf).toHaveLength(4);

    // Every quarterfinal is cross-group: group-mates cannot meet this early.
    const groupOf = new Map(
      (await testDb.select().from(players).where(eq(players.tournamentId, t.id))).map(
        (p) => [p.id, p.groupId]
      )
    );
    for (const m of qf) {
      expect(groupOf.get(m.playerAId!)).not.toBe(groupOf.get(m.playerBId!));
    }

    // Eight qualifiers, each exactly once, and the ninth is eliminated.
    const inBracket = qf.flatMap((m) => [m.playerAId!, m.playerBId!]);
    expect(new Set(inBracket).size).toBe(8);

    // The group of four sent everyone through; the group of five dropped one.
    const bySize = new Map<string | null, number>();
    for (const gid of groupOf.values()) bySize.set(gid, (bySize.get(gid) ?? 0) + 1);
    const smallGroup = [...bySize.entries()].find(([, n]) => n === 4)![0];
    const smallGroupInBracket = inBracket.filter((id) => groupOf.get(id) === smallGroup);
    expect(smallGroupInBracket).toHaveLength(4);
  });

  it("plays through to a champion and finishes the tournament", async () => {
    const { t } = await setupNine();
    await matchService.generateGroupMatches(t.id);
    await tournamentService.transition(t.id, "groups");

    await playPhase(t.id, "group", (a) => a);
    expect(await playPhase(t.id, "quarter", (a) => a)).toBe(4);
    expect(await playPhase(t.id, "semi", (a) => a)).toBe(2);
    expect(await playPhase(t.id, "final", (a) => a)).toBe(1);

    const [final] = await testDb
      .select()
      .from(matches)
      .where(and(eq(matches.tournamentId, t.id), eq(matches.phase, "final")));
    expect(final!.status).toBe("finished");
    expect(final!.winnerId).toBeTruthy();

    const [row] = await testDb.select().from(tournaments).where(eq(tournaments.id, t.id));
    expect(row!.status).toBe("finished");

    // 16 group + 4 quarters + 2 semis + 1 final, nothing stranded.
    const all = await matchService.listByTournament(t.id);
    expect(all).toHaveLength(23);
    expect(all.every((m) => m.status === "finished")).toBe(true);
  });

  it("prices the futures market over the nine-player field", async () => {
    const { t } = await setupNine();
    const { MarketService } = await import("@/lib/market");
    const marketService = new MarketService(testDb);
    await marketService.createTournamentWinner(t.id);

    const { markets, marketSelections } = await import("@/db/schema");
    const [market] = await testDb
      .select()
      .from(markets)
      .where(eq(markets.tournamentId, t.id));
    expect(market).toBeTruthy();
    const sels = await testDb
      .select()
      .from(marketSelections)
      .where(eq(marketSelections.marketId, market!.id));
    // One price per player, all of them real numbers.
    expect(sels).toHaveLength(9);
    for (const s of sels) {
      expect(Number(s.finalOdds)).toBeGreaterThan(1);
      expect(Number.isFinite(Number(s.finalOdds))).toBe(true);
    }
  });
});
