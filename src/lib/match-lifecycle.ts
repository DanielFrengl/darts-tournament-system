import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { matches, players } from "@/db/schema";
import { marketService } from "@/lib/market";
import { bettingService } from "@/lib/betting";
import { bracketService } from "@/lib/bracket";
import { publish } from "@/lib/event-bus";
import { updateRatings } from "@/lib/elo";

/**
 * Match/leg → market orchestration. Pure side-effect choreography:
 * each function takes the IDs of what just changed and applies the
 * corresponding market lifecycle updates.
 */

export async function onMatchesCreated(matchIds: string[]): Promise<void> {
  for (const id of matchIds) {
    await marketService.createForMatch(id);
  }
  // Tell each affected tournament page to refresh.
  const tournamentIds = new Set<string>();
  for (const id of matchIds) {
    const [m] = await db.select().from(matches).where(eq(matches.id, id));
    if (m) tournamentIds.add(m.tournamentId);
  }
  for (const tid of tournamentIds) {
    publish(`tournament:${tid}`, "matches_created");
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
  publish(`match:${matchId}`, "leg_started", { legId, legNumber });
  const [m] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (m) publish(`tournament:${m.tournamentId}`, "match_updated", { matchId });
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

    // Update both players' ELO ratings before advancing the bracket so
    // any seeded markets for next-round matches use the updated numbers.
    await updateMatchElo(matchId, matchWinnerId);

    // Move the bracket forward (creates next-round matches as needed)
    // and seed markets for any newly created matches.
    await bracketService.advanceWinner(matchId);
    await createMarketsForNewMatches(matchId);
  }

  publish(`match:${matchId}`, matchFinished ? "finished" : "leg_finished", {
    legId,
    legWinnerId,
    scoreA,
    scoreB,
  });
  const [m] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (m) {
    publish(`tournament:${m.tournamentId}`, "standings_updated", { matchId });
    if (matchFinished) {
      publish(`tournament:${m.tournamentId}`, "bracket_updated", { matchId });
    }
  }
}

export async function onMatchCancelled(matchId: string): Promise<void> {
  const ids = await marketService.cancelMatchMarkets(matchId);
  await bettingService.refundSelections(ids);
  publish(`match:${matchId}`, "cancelled");
  const [m] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (m) publish(`tournament:${m.tournamentId}`, "match_updated", { matchId });
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
async function updateMatchElo(matchId: string, winnerId: string): Promise<void> {
  const [m] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!m || !m.playerAId || !m.playerBId) return;
  const [pA] = await db.select().from(players).where(eq(players.id, m.playerAId));
  const [pB] = await db.select().from(players).where(eq(players.id, m.playerBId));
  if (!pA || !pB) return;
  const winnerSide = winnerId === pA.id ? "A" : "B";
  const { nextA, nextB } = updateRatings(pA.eloRating, pB.eloRating, winnerSide);
  await db.update(players).set({ eloRating: nextA }).where(eq(players.id, pA.id));
  await db.update(players).set({ eloRating: nextB }).where(eq(players.id, pB.id));
}

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
