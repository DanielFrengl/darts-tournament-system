import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, truncateAll, teardownTestDb, testDb } from "../setup/db";
import { matches, markets, marketSelections, legs } from "@/db/schema";
import { TournamentService } from "@/lib/tournament";
import { PlayerService } from "@/lib/player";
import { defaultTournamentConfig } from "@/lib/tournament-config";
import { MarketService } from "@/lib/market";

const tournamentService = new TournamentService(testDb);
const playerService = new PlayerService(testDb);
const marketService = new MarketService(testDb);

beforeAll(async () => {
  await setupTestDb();
});
beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await teardownTestDb();
});

async function setupMatch(bestOf = 3) {
  const t = await tournamentService.create({ name: "T", config: defaultTournamentConfig() });
  const gs = await playerService.ensureGroups(t.id, 1);
  const p1 = await playerService.add(t.id, "A");
  const p2 = await playerService.add(t.id, "B");
  await playerService.assignToGroup(p1.id, gs[0]!.id);
  await playerService.assignToGroup(p2.id, gs[0]!.id);
  const [m] = await testDb
    .insert(matches)
    .values({
      tournamentId: t.id,
      phase: "group",
      groupId: gs[0]!.id,
      playerAId: p1.id,
      playerBId: p2.id,
      bestOf,
      status: "scheduled",
    })
    .returning();
  return { tournament: t, match: m!, players: [p1, p2] as const };
}

describe("MarketService", () => {
  it("createForMatch creates match_winner with 2 selections and correct_score with 4 (bo3)", async () => {
    const { match } = await setupMatch(3);
    await marketService.createForMatch(match.id);
    const ms = await marketService.listByMatch(match.id);
    const matchWinner = ms.find((m) => m.type === "match_winner");
    const correctScore = ms.find((m) => m.type === "correct_score");
    expect(matchWinner).toBeTruthy();
    expect(correctScore).toBeTruthy();
    const mwSels = await marketService.getSelections(matchWinner!.id);
    expect(mwSels).toHaveLength(2);
    const csSels = await marketService.getSelections(correctScore!.id);
    expect(csSels).toHaveLength(4);
    const scores = csSels.map((s) => `${s.scoreA}:${s.scoreB}`).sort();
    expect(scores).toEqual(["0:2", "1:2", "2:0", "2:1"]);
  });

  it("createForMatch is idempotent", async () => {
    const { match } = await setupMatch();
    await marketService.createForMatch(match.id);
    await marketService.createForMatch(match.id);
    const ms = await marketService.listByMatch(match.id);
    expect(ms.filter((m) => m.type === "match_winner")).toHaveLength(1);
  });

  it("createForLeg creates leg_winner market with 2 selections", async () => {
    const { match } = await setupMatch();
    const [leg] = await testDb
      .insert(legs)
      .values({ matchId: match.id, legNumber: 1, status: "live" })
      .returning();
    await marketService.createForLeg(leg!.id);
    const ms = await testDb.select().from(markets).where(eq(markets.legId, leg!.id));
    expect(ms).toHaveLength(1);
    expect(ms[0]?.type).toBe("leg_winner");
    const sels = await testDb
      .select()
      .from(marketSelections)
      .where(eq(marketSelections.marketId, ms[0]!.id));
    expect(sels).toHaveLength(2);
  });

  it("closeMatchMarkets sets all match-scope markets to closed", async () => {
    const { match } = await setupMatch();
    await marketService.createForMatch(match.id);
    await marketService.closeMatchMarkets(match.id);
    const ms = await marketService.listByMatch(match.id);
    expect(ms.every((m) => m.status === "closed")).toBe(true);
  });

  it("settleMatchMarkets returns winning selection ids for match_winner + correct_score", async () => {
    const { match, players: [a] } = await setupMatch();
    await marketService.createForMatch(match.id);
    await marketService.closeMatchMarkets(match.id);
    const winning = await marketService.settleMatchMarkets(match.id, a.id, 2, 1);
    expect(winning.length).toBe(2);
    const sels = await testDb
      .select()
      .from(marketSelections)
      .where(eq(marketSelections.id, winning[0]!));
    expect(sels[0]?.isWinner).toBe(true);
  });

  it("settleLegMarket marks correct leg-winner selection", async () => {
    const { match, players: [a] } = await setupMatch();
    const [leg] = await testDb
      .insert(legs)
      .values({ matchId: match.id, legNumber: 1, status: "live" })
      .returning();
    await marketService.createForLeg(leg!.id);
    await marketService.closeLegMarket(leg!.id);
    const winning = await marketService.settleLegMarket(leg!.id, a.id);
    expect(winning).toHaveLength(1);
  });

  it("cancelMatchMarkets returns selection ids for refund", async () => {
    const { match } = await setupMatch();
    await marketService.createForMatch(match.id);
    const ids = await marketService.cancelMatchMarkets(match.id);
    expect(ids.length).toBeGreaterThan(0);
    const ms = await marketService.listByMatch(match.id);
    expect(ms.every((m) => m.status === "cancelled")).toBe(true);
  });
});
