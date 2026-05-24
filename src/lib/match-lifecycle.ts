import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { matches } from "@/db/schema";
import { marketService } from "@/lib/market";
import { bettingService } from "@/lib/betting";
import { bracketService } from "@/lib/bracket";

/**
 * Match/leg → market orchestration. Pure side-effect choreography:
 * each function takes the IDs of what just changed and applies the
 * corresponding market lifecycle updates.
 */

export async function onMatchesCreated(matchIds: string[]): Promise<void> {
  for (const id of matchIds) {
    await marketService.createForMatch(id);
  }
}

/**
 * Called after a new leg row is inserted (status=live).
 * If it's leg 1, close the match-level markets (match_winner +
 * correct_score). Always create the leg_winner market.
 */
export async function onLegStarted(legId: string, matchId: string, legNumber: number): Promise<void> {
  if (legNumber === 1) {
    await marketService.closeMatchMarkets(matchId);
  }
  await marketService.createForLeg(legId);
}

/**
 * Called after a leg result is recorded.
 *   - Close the leg_winner market for this leg (no more bets, settlement
 *     comes immediately after).
 *   - Settle leg_winner: pay leg winners / mark losers / write payouts.
 *   - If the match just finished, settle match-level markets too and
 *     trigger bracket advancement.
 */
export async function onLegFinished({
  legId,
  matchId,
  legWinnerId,
  matchFinished,
  matchWinnerId,
  scoreA,
  scoreB,
}: {
  legId: string;
  matchId: string;
  legWinnerId: string;
  matchFinished: boolean;
  matchWinnerId: string | null;
  scoreA: number;
  scoreB: number;
}): Promise<void> {
  await marketService.closeLegMarket(legId);
  const legWinning = await marketService.settleLegMarket(legId, legWinnerId);
  const legAllSelections = await selectionsOfMarketByLeg(legId);
  const legLosing = legAllSelections.filter((id) => !legWinning.includes(id));
  await bettingService.settleSelections(legWinning, legLosing);

  if (matchFinished && matchWinnerId) {
    const matchWinning = await marketService.settleMatchMarkets(
      matchId,
      matchWinnerId,
      scoreA,
      scoreB
    );
    const matchAllSelections = await selectionsOfMatchScopedMarkets(matchId);
    const matchLosing = matchAllSelections.filter((id) => !matchWinning.includes(id));
    await bettingService.settleSelections(matchWinning, matchLosing);

    // Move the bracket forward (creates next-round matches as needed)
    // and seed markets for any newly created matches.
    await bracketService.advanceWinner(matchId);
    await createMarketsForNewMatches(matchId);
  }
}

export async function onMatchCancelled(matchId: string): Promise<void> {
  const ids = await marketService.cancelMatchMarkets(matchId);
  await bettingService.refundSelections(ids);
}

async function selectionsOfMarketByLeg(legId: string): Promise<string[]> {
  const { markets, marketSelections } = await import("@/db/schema");
  const ms = await db.select().from(markets).where(eq(markets.legId, legId));
  const out: string[] = [];
  for (const m of ms) {
    const sels = await db
      .select({ id: marketSelections.id })
      .from(marketSelections)
      .where(eq(marketSelections.marketId, m.id));
    for (const s of sels) out.push(s.id);
  }
  return out;
}

async function selectionsOfMatchScopedMarkets(matchId: string): Promise<string[]> {
  const { markets, marketSelections } = await import("@/db/schema");
  const ms = await db.select().from(markets).where(eq(markets.matchId, matchId));
  const matchScoped = ms.filter((m) => m.scope === "match");
  const out: string[] = [];
  for (const m of matchScoped) {
    const sels = await db
      .select({ id: marketSelections.id })
      .from(marketSelections)
      .where(eq(marketSelections.marketId, m.id));
    for (const s of sels) out.push(s.id);
  }
  return out;
}

/**
 * After a bracket round advances, new matches show up in the same
 * tournament. Walk all open playoff matches without markets and seed
 * them. Idempotent because createForMatch is itself idempotent.
 */
async function createMarketsForNewMatches(originatingMatchId: string): Promise<void> {
  const [origin] = await db.select().from(matches).where(eq(matches.id, originatingMatchId));
  if (!origin) return;
  const all = await db
    .select()
    .from(matches)
    .where(eq(matches.tournamentId, origin.tournamentId));
  for (const m of all) {
    if (m.status === "scheduled" && m.playerAId && m.playerBId) {
      await marketService.createForMatch(m.id);
    }
  }
}
