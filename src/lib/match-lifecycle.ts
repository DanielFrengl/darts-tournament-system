import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { matches, players, tournaments } from "@/db/schema";
import { marketService } from "@/lib/market";
import { bettingService } from "@/lib/betting";
import { bracketService } from "@/lib/bracket";
import { matchService } from "@/lib/match";
import { tournamentService } from "@/lib/tournament";
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
  if (m) {
    if (legNumber === 1) {
      // Toast-worthy: match transitions to live.
      const summary = await buildMatchSummary(matchId);
      const players = await buildMatchPlayers(matchId);
      publish(`tournament:${m.tournamentId}`, "match_started", {
        matchId,
        summary,
        ...players,
      });
    } else {
      publish(`tournament:${m.tournamentId}`, "match_updated", { matchId });
    }
  }
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

    // Bracket choreography runs after settlement. It must NOT be able to
    // suppress the match_finished notification published below — bets are
    // already settled, so a bracket-advancement failure (e.g. inconsistent
    // seeding) should be logged, not swallow the "round end" event players
    // are waiting on.
    try {
      // Update both players' ELO ratings before advancing the bracket so
      // any seeded markets for next-round matches use the updated numbers.
      await updateMatchElo(matchId, matchWinnerId);

      // Move the bracket forward (creates next-round matches as needed)
      // and seed markets for any newly created matches.
      await bracketService.advanceWinner(matchId);
      await createMarketsForNewMatches(matchId);

      // Auto-create playoff bracket when the last group match finishes.
      await maybeAutoStartPlayoff(matchId);
      // Auto-finish the tournament when the final concludes.
      await maybeAutoFinishTournament(matchId);
    } catch (err) {
      console.error(
        `[match-lifecycle] bracket advancement failed for match ${matchId}:`,
        err
      );
    }
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
      const summary = await buildMatchSummary(matchId);
      const players = await buildMatchPlayers(matchId);
      publish(`tournament:${m.tournamentId}`, "match_finished", {
        matchId,
        summary,
        ...players,
        scoreA,
        scoreB,
      });
      publish(`tournament:${m.tournamentId}`, "bracket_updated", { matchId });
    }
  }
}

export async function onMatchCancelled(matchId: string): Promise<void> {
  const ids = await marketService.cancelMatchMarkets(matchId);
  await bettingService.refundSelections(ids);
  publish(`match:${matchId}`, "cancelled");
  const [m] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (m) {
    const summary = await buildMatchSummary(matchId);
    publish(`tournament:${m.tournamentId}`, "match_cancelled", {
      matchId,
      summary,
    });
  }
}

/**
 * "Daniel vs Karel" or, when finished, "Daniel 3:1 Karel — vyhrál Daniel".
 * Used in tournament-channel events so the client can toast without
 * another round trip.
 */
async function buildMatchSummary(matchId: string): Promise<string | null> {
  const [m] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!m) return null;
  const ids = [m.playerAId, m.playerBId].filter((x): x is string => !!x);
  if (ids.length < 2) return null;
  const { players: playersTable } = await import("@/db/schema");
  const ps = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.id, ids[0]!));
  const ps2 = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.id, ids[1]!));
  const a = ps[0];
  const b = ps2[0];
  if (!a || !b) return null;
  if (m.status === "finished" && m.winnerId) {
    const winnerName = m.winnerId === a.id ? a.name : b.name;
    return `${a.name} ${m.scoreA}:${m.scoreB} ${b.name} — vyhrál ${winnerName}`;
  }
  if (m.status === "cancelled") {
    return `${a.name} vs ${b.name}`;
  }
  return `${a.name} vs ${b.name}`;
}

/**
 * Structured player/winner names for a match, used so the client can
 * render clean toasts without re-parsing the summary string.
 */
async function buildMatchPlayers(matchId: string): Promise<{
  playerA: string | null;
  playerB: string | null;
  winner: string | null;
}> {
  const [m] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!m) return { playerA: null, playerB: null, winner: null };
  const ids = [m.playerAId, m.playerBId].filter((x): x is string => !!x);
  if (ids.length < 2) return { playerA: null, playerB: null, winner: null };
  const { players: playersTable } = await import("@/db/schema");
  const [a] = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.id, ids[0]!));
  const [b] = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.id, ids[1]!));
  if (!a || !b) return { playerA: null, playerB: null, winner: null };
  const winner =
    m.winnerId == null ? null : m.winnerId === a.id ? a.name : b.name;
  return { playerA: a.name, playerB: b.name, winner };
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

/**
 * If the just-finished match was the last unfinished group match and the
 * tournament is in 'groups' status, automatically generate the playoff
 * bracket and transition. Eliminates the manual "Vytvořit pavouka" step.
 */
async function maybeAutoStartPlayoff(matchId: string): Promise<void> {
  const [m] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!m || m.phase !== "group") return;
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, m.tournamentId));
  if (!t || t.status !== "groups") return;
  const groupMatches = await matchService.listGroupMatches(t.id);
  const unfinished = groupMatches.filter(
    (gm) => gm.status !== "finished" && gm.status !== "cancelled"
  );
  if (unfinished.length > 0) return;

  await bracketService.createBracket(t.id);
  await tournamentService.transition(t.id, "playoff");
  const all = await matchService.listByTournament(t.id);
  const playoff = all.filter((mm) => mm.phase !== "group");
  for (const pm of playoff) {
    await marketService.createForMatch(pm.id);
  }
  await marketService.closeTournamentMarkets(t.id);
  publish(`tournament:${t.id}`, "playoff_started");
}

/**
 * If the final just finished, mark the tournament finished and settle
 * tournament-level markets (winner, 2nd, 3rd place).
 */
async function maybeAutoFinishTournament(matchId: string): Promise<void> {
  const [m] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!m || m.phase !== "final") return;
  if (!m.winnerId) return;
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, m.tournamentId));
  if (!t || t.status !== "playoff") return;

  await tournamentService.transition(t.id, "finished");

  // Winner = m.winnerId; runner-up = the other player in the final.
  const runnerUpId = m.playerAId === m.winnerId ? m.playerBId : m.playerAId;
  const winningWin = await marketService.settleTournamentPlace(
    t.id,
    "tournament_winner",
    m.winnerId
  );
  const winningRu = runnerUpId
    ? await marketService.settleTournamentPlace(
        t.id,
        "tournament_runner_up",
        runnerUpId
      )
    : [];

  // Third place: winner of the third_place match, if it exists & finished.
  const [thirdMatch] = await db
    .select()
    .from(matches)
    .where(eq(matches.tournamentId, t.id));
  const all = await db.select().from(matches).where(eq(matches.tournamentId, t.id));
  const thirdPlaceMatch = all.find((mm) => mm.phase === "third_place" && mm.status === "finished");
  const winningThird = thirdPlaceMatch?.winnerId
    ? await marketService.settleTournamentPlace(
        t.id,
        "tournament_third",
        thirdPlaceMatch.winnerId
      )
    : [];
  void thirdMatch;

  const winning = [...winningWin, ...winningRu, ...winningThird];
  const allTourSelections = await tournamentScopedSelectionIds(t.id);
  const losing = allTourSelections.filter((id) => !winning.includes(id));
  await bettingService.settleSelections(winning, losing);
  const { players: playersTable } = await import("@/db/schema");
  const [winnerPlayer] = await db
    .select({ name: playersTable.name })
    .from(playersTable)
    .where(eq(playersTable.id, m.winnerId));
  publish(`tournament:${t.id}`, "tournament_finished", {
    summary: winnerPlayer
      ? `Vítěz: ${winnerPlayer.name}`
      : undefined,
  });
}

async function tournamentScopedSelectionIds(tournamentId: string): Promise<string[]> {
  const { markets, marketSelections } = await import("@/db/schema");
  const ms = await db
    .select()
    .from(markets)
    .where(eq(markets.tournamentId, tournamentId));
  const tourScoped = ms.filter((mm) => mm.scope === "tournament");
  const out: string[] = [];
  for (const mm of tourScoped) {
    const sels = await db
      .select({ id: marketSelections.id })
      .from(marketSelections)
      .where(eq(marketSelections.marketId, mm.id));
    for (const s of sels) out.push(s.id);
  }
  return out;
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
