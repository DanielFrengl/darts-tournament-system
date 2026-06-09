import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, truncateAll, teardownTestDb, testDb } from "../setup/db";
import { matches, markets, marketSelections, bets, users, transactions } from "@/db/schema";
import { createUser } from "../setup/factories";
import { TournamentService } from "@/lib/tournament";
import { PlayerService } from "@/lib/player";
import { defaultTournamentConfig } from "@/lib/tournament-config";
import { MarketService } from "@/lib/market";
import { CapitalService } from "@/lib/capital";
import { BettingService } from "@/lib/betting";

const tournamentService = new TournamentService(testDb);
const playerService = new PlayerService(testDb);
const marketService = new MarketService(testDb);
const capitalService = new CapitalService(testDb);
const bettingService = new BettingService(testDb, capitalService, marketService);

beforeAll(async () => {
  await setupTestDb();
});
beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await teardownTestDb();
});

async function setupBettableMatch() {
  const t = await tournamentService.create({ name: "T", config: defaultTournamentConfig() });
  const gs = await playerService.ensureGroups(t.id, 1);
  const pA = await playerService.add(t.id, "A");
  const pB = await playerService.add(t.id, "B");
  await playerService.assignToGroup(pA.id, gs[0]!.id);
  await playerService.assignToGroup(pB.id, gs[0]!.id);
  const [m] = await testDb
    .insert(matches)
    .values({
      tournamentId: t.id,
      phase: "group",
      groupId: gs[0]!.id,
      playerAId: pA.id,
      playerBId: pB.id,
      bestOf: 3,
      status: "scheduled",
    })
    .returning();
  await marketService.createForMatch(m!.id);
  const ms = await marketService.listByMatch(m!.id);
  const mw = ms.find((x) => x.type === "match_winner")!;
  const sels = await marketService.getSelections(mw.id);
  return {
    tournament: t,
    match: m!,
    players: [pA, pB] as const,
    matchWinnerMarket: mw,
    matchWinnerSelections: sels,
  };
}

describe("BettingService.placeBet", () => {
  it("debits capital and inserts an open bet with locked_odds", async () => {
    const u = await createUser({ capital: "1000" });
    const { matchWinnerSelections } = await setupBettableMatch();
    const sel = matchWinnerSelections[0]!;
    const r = await bettingService.placeBet(u.id, sel.id, 100);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bet.lockedOdds).toBe(sel.finalOdds);
    const [reloadedUser] = await testDb.select().from(users).where(eq(users.id, u.id));
    expect(Number(reloadedUser?.capital)).toBe(900);
    const txs = await testDb.select().from(transactions).where(eq(transactions.userId, u.id));
    expect(txs).toHaveLength(1);
    expect(txs[0]?.type).toBe("bet_placed");
  });

  it("rejects bet when market is not open", async () => {
    const u = await createUser({ capital: "1000" });
    const { matchWinnerMarket, matchWinnerSelections } = await setupBettableMatch();
    await marketService.closeMatchMarkets(matchWinnerMarket.matchId!);
    const r = await bettingService.placeBet(u.id, matchWinnerSelections[0]!.id, 50);
    expect(r.ok).toBe(false);
  });

  it("rejects stake exceeding max_stake_pct of capital", async () => {
    const u = await createUser({ capital: "100" });
    const { matchWinnerSelections } = await setupBettableMatch();
    const r = await bettingService.placeBet(u.id, matchWinnerSelections[0]!.id, 80);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/max/i);
  });

  it("rejects stake larger than balance", async () => {
    const u = await createUser({ capital: "5" });
    const { matchWinnerSelections } = await setupBettableMatch();
    const r = await bettingService.placeBet(u.id, matchWinnerSelections[0]!.id, 10);
    expect(r.ok).toBe(false);
  });

  it("recomputes market odds after a bet", async () => {
    const u = await createUser({ capital: "10000" });
    const { matchWinnerSelections } = await setupBettableMatch();
    const sel = matchWinnerSelections[0]!;
    const before = sel.finalOdds;
    await bettingService.placeBet(u.id, sel.id, 1000);
    const [reloaded] = await testDb
      .select()
      .from(marketSelections)
      .where(eq(marketSelections.id, sel.id));
    expect(reloaded?.pariOdds).not.toBeNull();
    // With 100% of pool on this selection, parimutuel odds → 1 (no money to win),
    // so blended final_odds shifts downward.
    expect(Number(reloaded?.finalOdds)).not.toBe(Number(before));
  });
});

describe("BettingService settlement", () => {
  it("settleSelections pays winners and marks losers as lost", async () => {
    const u1 = await createUser({ capital: "1000", email: "u1@a.cz", username: "u1" });
    const u2 = await createUser({ capital: "1000", email: "u2@a.cz", username: "u2" });
    const { matchWinnerSelections, matchWinnerMarket, match, players: [a] } =
      await setupBettableMatch();
    const aSel = matchWinnerSelections.find((s) => s.playerId === a.id)!;
    const bSel = matchWinnerSelections.find((s) => s.playerId !== a.id)!;
    const r1 = await bettingService.placeBet(u1.id, aSel.id, 100);
    const r2 = await bettingService.placeBet(u2.id, bSel.id, 100);
    expect(r1.ok && r2.ok).toBe(true);
    await marketService.closeMatchMarkets(match.id);
    const winning = await marketService.settleMatchMarkets(match.id, a.id, 2, 0);
    const losing = matchWinnerSelections.filter((s) => !winning.includes(s.id)).map((s) => s.id);
    await bettingService.settleSelections(winning, losing);
    const [b1] = await testDb.select().from(bets).where(eq(bets.userId, u1.id));
    const [b2] = await testDb.select().from(bets).where(eq(bets.userId, u2.id));
    expect(b1?.status).toBe("won");
    expect(Number(b1?.payout)).toBeCloseTo(Number(b1!.stake) * Number(b1!.lockedOdds), 2);
    expect(b2?.status).toBe("lost");
    const [u1Reloaded] = await testDb.select().from(users).where(eq(users.id, u1.id));
    expect(Number(u1Reloaded?.capital)).toBeGreaterThan(900);
    void matchWinnerMarket;
  });

  it("cancelBet refunds stake, marks bet refunded and recomputes odds", async () => {
    const u = await createUser({ capital: "1000" });
    const { matchWinnerSelections, matchWinnerMarket } = await setupBettableMatch();
    const sel = matchWinnerSelections[0]!;
    const placed = await bettingService.placeBet(u.id, sel.id, 100);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;

    const r = await bettingService.cancelBet(u.id, placed.bet.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.refund).toBe(100);

    const [reloadedUser] = await testDb.select().from(users).where(eq(users.id, u.id));
    expect(Number(reloadedUser?.capital)).toBe(1000);

    const [b] = await testDb.select().from(bets).where(eq(bets.id, placed.bet.id));
    expect(b?.status).toBe("refunded");
    expect(Number(b?.payout)).toBe(100);

    const txs = await testDb
      .select()
      .from(transactions)
      .where(eq(transactions.userId, u.id));
    expect(txs.some((t) => t.type === "bet_refund" && t.betId === placed.bet.id)).toBe(
      true
    );

    // Pool is empty again → parimutuel component cleared.
    const [reloadedSel] = await testDb
      .select()
      .from(marketSelections)
      .where(eq(marketSelections.id, sel.id));
    expect(reloadedSel?.pariOdds).toBeNull();
    void matchWinnerMarket;
  });

  it("cancelBet rejects when the market is no longer open", async () => {
    const u = await createUser({ capital: "1000" });
    const { matchWinnerSelections, match } = await setupBettableMatch();
    const sel = matchWinnerSelections[0]!;
    const placed = await bettingService.placeBet(u.id, sel.id, 100);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;

    await marketService.closeMatchMarkets(match.id);

    const r = await bettingService.cancelBet(u.id, placed.bet.id);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/otevřený/);

    // Nothing refunded, bet stays open.
    const [reloadedUser] = await testDb.select().from(users).where(eq(users.id, u.id));
    expect(Number(reloadedUser?.capital)).toBe(900);
    const [b] = await testDb.select().from(bets).where(eq(bets.id, placed.bet.id));
    expect(b?.status).toBe("open");
  });

  it("refundSelections restores capital and marks bets refunded", async () => {
    const u = await createUser({ capital: "1000" });
    const { matchWinnerSelections, match } = await setupBettableMatch();
    const sel = matchWinnerSelections[0]!;
    await bettingService.placeBet(u.id, sel.id, 200);
    const ids = await marketService.cancelMatchMarkets(match.id);
    await bettingService.refundSelections(ids);
    const [reloaded] = await testDb.select().from(users).where(eq(users.id, u.id));
    expect(Number(reloaded?.capital)).toBe(1000);
    const [b] = await testDb.select().from(bets).where(eq(bets.userId, u.id));
    expect(b?.status).toBe("refunded");
  });
});
