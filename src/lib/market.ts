import { and, eq, inArray, sum } from "drizzle-orm";
import {
  bets,
  legs,
  markets,
  marketSelections,
  matches,
  players,
  tournaments,
  type Market,
  type MarketSelection,
} from "@/db/schema";
import type { DB } from "@/db/client";
import { winProbability } from "@/lib/elo";
import {
  correctScoreDistribution,
  parimutuelOdds,
  marketProbabilities,
  moneyWeight,
  clampOdds,
  probabilityToOdds,
  probabilityFromOdds,
} from "@/lib/odds";
import {
  resolveOddsConfig,
  type OddsBalanceConfig,
  type TournamentConfig,
} from "@/lib/tournament-config";
import { simulateTournament, type SimConfig } from "@/lib/tournament-sim";
import { loadGroupDraw } from "@/lib/sim-draw";
import { publish } from "@/lib/event-bus";

type SelectionDraft = {
  label: string;
  playerId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  probability: number;
};

export class MarketService {
  constructor(private readonly db: DB) {}

  async listByMatch(matchId: string): Promise<Market[]> {
    return this.db.select().from(markets).where(eq(markets.matchId, matchId));
  }

  async getSelections(marketId: string): Promise<MarketSelection[]> {
    return this.db
      .select()
      .from(marketSelections)
      .where(eq(marketSelections.marketId, marketId));
  }

  /**
   * Idempotent: creates match_winner + correct_score markets for the
   * given match if they don't already exist. Uses current ELO ratings
   * for both players to seed stat_odds.
   */
  async createForMatch(matchId: string): Promise<void> {
    const [match] = await this.db.select().from(matches).where(eq(matches.id, matchId));
    if (!match) throw new Error("match not found");
    if (!match.playerAId || !match.playerBId) return;
    const existing = await this.listByMatch(matchId);
    // Cancelled markets don't count as existing: a book voided because the
    // match length changed has to be replaced, not treated as still there.
    if (
      existing.some(
        (m) => m.type === "match_winner" && m.status !== "cancelled"
      )
    ) {
      return;
    }

    const [pA] = await this.db.select().from(players).where(eq(players.id, match.playerAId));
    const [pB] = await this.db.select().from(players).where(eq(players.id, match.playerBId));
    if (!pA || !pB) return;
    const [t] = await this.db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, match.tournamentId));
    if (!t) return;
    const cfg = t.configJson as TournamentConfig;

    const pAWinsLeg = winProbability(pA.eloRating, pB.eloRating);
    const pAWinsMatch = matchWinProbabilityFromLegProb(pAWinsLeg, match.bestOf);

    await this.insertMarket(
      {
        tournamentId: match.tournamentId,
        matchId: match.id,
        type: "match_winner",
        scope: "match",
        status: "open",
      },
      [
        {
          label: pA.name,
          playerId: pA.id,
          scoreA: null,
          scoreB: null,
          probability: pAWinsMatch,
        },
        {
          label: pB.name,
          playerId: pB.id,
          scoreA: null,
          scoreB: null,
          probability: 1 - pAWinsMatch,
        },
      ],
      cfg
    );

    const dist = correctScoreDistribution(pAWinsLeg, match.bestOf);
    const selections: SelectionDraft[] = [];
    for (const [score, prob] of dist) {
      const [sa, sb] = score.split(":").map((n) => Number(n)) as [number, number];
      selections.push({
        label: `${sa}:${sb}`,
        playerId: null,
        scoreA: sa,
        scoreB: sb,
        probability: prob,
      });
    }
    await this.insertMarket(
      {
        tournamentId: match.tournamentId,
        matchId: match.id,
        type: "correct_score",
        scope: "match",
        status: "open",
      },
      selections,
      cfg
    );
  }

  /**
   * Create a leg_winner market when a leg starts. The leg row must
   * already exist. Reuses match ELO ratings for stat odds (we don't
   * re-rate intra-match).
   */
  async createForLeg(legId: string): Promise<void> {
    const [leg] = await this.db.select().from(legs).where(eq(legs.id, legId));
    if (!leg) throw new Error("leg not found");
    const existing = await this.db
      .select()
      .from(markets)
      .where(and(eq(markets.legId, legId), eq(markets.type, "leg_winner")));
    if (existing.length > 0) return;

    const [match] = await this.db
      .select()
      .from(matches)
      .where(eq(matches.id, leg.matchId));
    if (!match || !match.playerAId || !match.playerBId) return;
    const [pA] = await this.db.select().from(players).where(eq(players.id, match.playerAId));
    const [pB] = await this.db.select().from(players).where(eq(players.id, match.playerBId));
    if (!pA || !pB) return;
    const [t] = await this.db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, match.tournamentId));
    if (!t) return;
    const cfg = t.configJson as TournamentConfig;

    const pAWinsLeg = winProbability(pA.eloRating, pB.eloRating);
    await this.insertMarket(
      {
        tournamentId: match.tournamentId,
        matchId: match.id,
        legId: leg.id,
        type: "leg_winner",
        scope: "leg",
        status: "open",
      },
      [
        {
          label: pA.name,
          playerId: pA.id,
          scoreA: null,
          scoreB: null,
          probability: pAWinsLeg,
        },
        {
          label: pB.name,
          playerId: pB.id,
          scoreA: null,
          scoreB: null,
          probability: 1 - pAWinsLeg,
        },
      ],
      cfg
    );
  }

  /**
   * Tournament Winner futures market. Opens when groups start, closes
   * when playoff begins, settles when the tournament finishes. Uniform
   * 1/N baseline odds (no Monte Carlo yet) — refined later when ratings
   * have data to draw from.
   */
  async createTournamentWinner(tournamentId: string): Promise<void> {
    const existing = await this.db
      .select()
      .from(markets)
      .where(
        and(
          eq(markets.tournamentId, tournamentId),
          eq(markets.type, "tournament_winner")
        )
      );
    if (existing.length > 0) return;

    const tPlayers = await this.db
      .select()
      .from(players)
      .where(eq(players.tournamentId, tournamentId));
    if (tPlayers.length < 2) return;
    const [t] = await this.db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));
    if (!t) return;
    const cfg = t.configJson as TournamentConfig;

    // Futures open once the groups are drawn, so price the draw that
    // happened rather than an average over draws that did not.
    const draw = await loadGroupDraw(this.db, tournamentId);
    const sim = simulateTournament(
      tPlayers.map((p) => ({ id: p.id, name: p.name, eloRating: p.eloRating })),
      toSimConfig(cfg),
      { runs: 10000, draw }
    );

    await this.insertMarket(
      {
        tournamentId,
        type: "tournament_winner",
        scope: "tournament",
        status: "open",
      },
      tPlayers.map((p) => ({
        label: p.name,
        playerId: p.id,
        scoreA: null,
        scoreB: null,
        probability: clampProb(sim.winProb[p.id], tPlayers.length),
      })),
      cfg
    );
  }

  /**
   * Open futures markets for 2nd and 3rd place alongside the winner
   * market. Same uniform 1/N baseline as winner; refined via parimutuel
   * once bets come in.
   */
  async createTournamentPlaces(tournamentId: string): Promise<void> {
    const existing = await this.db
      .select({ type: markets.type })
      .from(markets)
      .where(eq(markets.tournamentId, tournamentId));
    const existingTypes = new Set(existing.map((m) => m.type));

    const tPlayers = await this.db
      .select()
      .from(players)
      .where(eq(players.tournamentId, tournamentId));
    if (tPlayers.length < 2) return;
    const [t] = await this.db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));
    if (!t) return;
    const cfg = t.configJson as TournamentConfig;

    const placeMarkets: { type: "tournament_runner_up" | "tournament_third" }[] = [];
    if (!existingTypes.has("tournament_runner_up"))
      placeMarkets.push({ type: "tournament_runner_up" });
    if (cfg.thirdPlaceMatch && !existingTypes.has("tournament_third"))
      placeMarkets.push({ type: "tournament_third" });

    // Futures open once the groups are drawn, so price the draw that
    // happened rather than an average over draws that did not.
    const draw = await loadGroupDraw(this.db, tournamentId);
    const sim = simulateTournament(
      tPlayers.map((p) => ({ id: p.id, name: p.name, eloRating: p.eloRating })),
      toSimConfig(cfg),
      { runs: 10000, draw }
    );

    for (const { type } of placeMarkets) {
      const probMap =
        type === "tournament_runner_up" ? sim.runnerUpProb : sim.thirdProb;
      await this.insertMarket(
        {
          tournamentId,
          type,
          scope: "tournament",
          status: "open",
        },
        tPlayers.map((p) => ({
          label: p.name,
          playerId: p.id,
          scoreA: null,
          scoreB: null,
          probability: clampProb(probMap[p.id], tPlayers.length),
        })),
        cfg
      );
    }
  }

  /**
   * Settle a single tournament-scope futures market (winner / 2nd / 3rd).
   * Returns winning selection ids.
   */
  async settleTournamentPlace(
    tournamentId: string,
    type:
      | "tournament_winner"
      | "tournament_runner_up"
      | "tournament_third",
    placePlayerId: string
  ): Promise<string[]> {
    const ms = await this.db
      .select()
      .from(markets)
      .where(
        and(eq(markets.tournamentId, tournamentId), eq(markets.type, type))
      );
    const winning: string[] = [];
    for (const m of ms) {
      const sels = await this.getSelections(m.id);
      for (const sel of sels) {
        const isWin = sel.playerId === placePlayerId;
        await this.db
          .update(marketSelections)
          .set({ isWinner: isWin })
          .where(eq(marketSelections.id, sel.id));
        if (isWin) winning.push(sel.id);
      }
      await this.db
        .update(markets)
        .set({ status: "settled", settledAt: new Date() })
        .where(eq(markets.id, m.id));
    }
    return winning;
  }

  async closeTournamentMarkets(tournamentId: string): Promise<void> {
    await this.db
      .update(markets)
      .set({ status: "closed", closesAt: new Date() })
      .where(
        and(
          eq(markets.tournamentId, tournamentId),
          eq(markets.scope, "tournament"),
          eq(markets.status, "open")
        )
      );
  }

  async settleTournamentWinner(
    tournamentId: string,
    winnerPlayerId: string
  ): Promise<string[]> {
    const ms = await this.db
      .select()
      .from(markets)
      .where(
        and(
          eq(markets.tournamentId, tournamentId),
          eq(markets.type, "tournament_winner")
        )
      );
    const winning: string[] = [];
    for (const m of ms) {
      const sels = await this.getSelections(m.id);
      for (const sel of sels) {
        const isWin = sel.playerId === winnerPlayerId;
        await this.db
          .update(marketSelections)
          .set({ isWinner: isWin })
          .where(eq(marketSelections.id, sel.id));
        if (isWin) winning.push(sel.id);
      }
      await this.db
        .update(markets)
        .set({ status: "settled", settledAt: new Date() })
        .where(eq(markets.id, m.id));
    }
    return winning;
  }

  async closeMarket(marketId: string): Promise<void> {
    await this.db
      .update(markets)
      .set({ status: "closed", closesAt: new Date() })
      .where(and(eq(markets.id, marketId), eq(markets.status, "open")));
  }

  async closeMatchMarkets(matchId: string): Promise<void> {
    await this.db
      .update(markets)
      .set({ status: "closed", closesAt: new Date() })
      .where(
        and(
          eq(markets.matchId, matchId),
          eq(markets.status, "open"),
          eq(markets.scope, "match")
        )
      );
  }

  async closeLegMarket(legId: string): Promise<void> {
    await this.db
      .update(markets)
      .set({ status: "closed", closesAt: new Date() })
      .where(and(eq(markets.legId, legId), eq(markets.status, "open")));
  }

  /**
   * Recompute parimutuel and final odds for a single market. Call this
   * after any new bet on the market.
   */
  async recomputeOdds(marketId: string): Promise<void> {
    const [m] = await this.db.select().from(markets).where(eq(markets.id, marketId));
    if (!m) return;
    const [t] = await this.db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, m.tournamentId));
    if (!t) return;
    const cfg = t.configJson as TournamentConfig;
    const odds = resolveOddsConfig(cfg);
    const sels = await this.getSelections(marketId);

    // One pass over the whole market: prices have to be set together, since
    // each selection's probability depends on the pool as a whole.
    const pools: number[] = [];
    for (const sel of sels) {
      const [selRow] = await this.db
        .select({ pool: sum(bets.stake) })
        .from(bets)
        .where(and(eq(bets.selectionId, sel.id), eq(bets.status, "open")));
      pools.push(Number(selRow?.pool ?? 0));
    }
    const totalPool = pools.reduce((a, b) => a + b, 0);

    // What the ratings think, recovered from the opening prices.
    const model = sels.map(
      (sel) =>
        probabilityFromOdds(Number(sel.statOdds), odds.houseEdge) ??
        1 / Math.max(sels.length, 1)
    );
    const probs = marketProbabilities(
      model,
      pools,
      moneyWeight(totalPool, odds.parimutuelThreshold, odds.moneyWeight)
    );

    for (let i = 0; i < sels.length; i++) {
      const sel = sels[i]!;
      const p = probs[i]!;
      const final = clampOdds(
        p > 0 ? probabilityToOdds(Math.min(p, 0.999999), odds.houseEdge) : odds.maxOdds,
        odds.minOdds,
        odds.maxOdds
      );
      // Informational only: what a straight tote payout would have been.
      const pari = parimutuelOdds(totalPool, pools[i]!, odds.houseEdge);
      await this.db
        .update(marketSelections)
        .set({
          pariOdds: pari === null ? null : pari.toFixed(4),
          finalOdds: final.toFixed(4),
        })
        .where(eq(marketSelections.id, sel.id));
    }
    publish(`market:${marketId}`, "odds_changed", { totalPool });
    // Also publish on the tournament channel so any open page (Sázení,
    // /tournament, dashboard) refreshes when anyone in any market bets.
    publish(`tournament:${m.tournamentId}`, "odds_changed", {
      marketId,
      totalPool,
    });
  }

  /**
   * Settle match-level markets after a match finishes.
   *   match_winner → selection whose playerId === winnerId
   *   correct_score → selection whose scoreA/scoreB matches the final
   * Returns ids of winning selections (caller pays them out).
   */
  async settleMatchMarkets(
    matchId: string,
    winnerId: string,
    scoreA: number,
    scoreB: number
  ): Promise<string[]> {
    const ms = await this.db
      .select()
      .from(markets)
      .where(
        and(
          eq(markets.matchId, matchId),
          eq(markets.scope, "match"),
          eq(markets.status, "closed")
        )
      );
    const winningSelections: string[] = [];
    for (const m of ms) {
      const sels = await this.getSelections(m.id);
      for (const sel of sels) {
        const isWin =
          m.type === "match_winner"
            ? sel.playerId === winnerId
            : m.type === "correct_score"
              ? sel.scoreA === scoreA && sel.scoreB === scoreB
              : false;
        await this.db
          .update(marketSelections)
          .set({ isWinner: isWin })
          .where(eq(marketSelections.id, sel.id));
        if (isWin) winningSelections.push(sel.id);
      }
      await this.db
        .update(markets)
        .set({ status: "settled", settledAt: new Date() })
        .where(eq(markets.id, m.id));
    }
    return winningSelections;
  }

  /**
   * Settle the leg_winner market for a single leg. Skips cancelled
   * (voided) markets — when an undone leg is re-recorded, its voided
   * market must stay void instead of flipping to settled.
   */
  async settleLegMarket(legId: string, winnerId: string): Promise<string[]> {
    const ms = await this.db
      .select()
      .from(markets)
      .where(
        and(
          eq(markets.legId, legId),
          eq(markets.type, "leg_winner"),
          inArray(markets.status, ["open", "closed"])
        )
      );
    const winning: string[] = [];
    for (const m of ms) {
      const sels = await this.getSelections(m.id);
      for (const sel of sels) {
        const isWin = sel.playerId === winnerId;
        await this.db
          .update(marketSelections)
          .set({ isWinner: isWin })
          .where(eq(marketSelections.id, sel.id));
        if (isWin) winning.push(sel.id);
      }
      await this.db
        .update(markets)
        .set({ status: "settled", settledAt: new Date() })
        .where(eq(markets.id, m.id));
    }
    return winning;
  }

  /**
   * Cancel all markets for a match and return ids of open selections
   * (caller refunds bets on them).
   */
  async cancelMatchMarkets(matchId: string): Promise<string[]> {
    const ms = await this.db.select().from(markets).where(eq(markets.matchId, matchId));
    const selectionIds: string[] = [];
    for (const m of ms) {
      if (m.status === "open" || m.status === "closed") {
        const sels = await this.getSelections(m.id);
        for (const s of sels) selectionIds.push(s.id);
      }
      await this.db
        .update(markets)
        .set({ status: "cancelled" })
        .where(eq(markets.id, m.id));
    }
    return selectionIds;
  }

  /**
   * Put a cancelled match's books back where they were before the cancel.
   *
   * Each market is restored to the state its own data implies, rather than
   * blanket-reopened:
   *   - selections carrying an isWinner verdict were settled, and their
   *     payouts were never clawed back, so they go back to settled;
   *   - a pre-match book on a match that had already started goes back to
   *     closed — betting on the winner shut when leg 1 began;
   *   - anything else reopens.
   *
   * A pre-match book cancelled because the match length changed has already
   * been replaced, so restoring it would put a stale price (for the old
   * best-of) back on the board next to the current one. Per type, only the
   * newest cancelled market is eligible, and only when nothing live replaced
   * it. Leg books have one market per leg, so that question doesn't arise.
   *
   * Returns how many markets were restored.
   */
  async restoreMatchMarkets(
    matchId: string,
    opts: { started: boolean }
  ): Promise<number> {
    const ms = await this.db
      .select()
      .from(markets)
      .where(eq(markets.matchId, matchId));

    const eligible: typeof ms = [];
    const matchScope = ms.filter((m) => m.scope === "match");
    for (const type of new Set(matchScope.map((m) => m.type))) {
      const ofType = matchScope.filter((m) => m.type === type);
      if (ofType.some((m) => m.status !== "cancelled")) continue;
      eligible.push(ofType.reduce((a, b) => (a.opensAt >= b.opensAt ? a : b)));
    }
    for (const m of ms) {
      if (m.scope !== "match" && m.status === "cancelled") eligible.push(m);
    }

    for (const m of eligible) {
      const sels = await this.getSelections(m.id);
      const wasSettled = sels.some((s) => s.isWinner !== null);
      const status = wasSettled
        ? "settled"
        : m.scope === "match" && opts.started
          ? "closed"
          : "open";
      await this.db
        .update(markets)
        .set({
          status,
          closesAt: status === "open" ? null : (m.closesAt ?? new Date()),
          settledAt: status === "settled" ? (m.settledAt ?? new Date()) : null,
        })
        .where(eq(markets.id, m.id));
    }
    return eligible.length;
  }

  /**
   * Re-price a tournament's open match- and leg-level markets from the
   * players' current ELO ratings.
   *
   * Only `statOdds` is rewritten, and in place: selections keep their ids, so
   * bets already placed against them are untouched and keep the odds they
   * locked in. `recomputeOdds` then rebuilds the published kurz from the new
   * baseline plus whatever money is already in the pool.
   *
   * Used after a rating repair, when every market was seeded off a roster
   * that was uniformly sitting at the 1500 default.
   */
  async repriceOpenMarkets(tournamentId: string): Promise<number> {
    const [t] = await this.db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));
    if (!t) return 0;
    const odds = resolveOddsConfig(t.configJson as TournamentConfig);
    const open = await this.db
      .select()
      .from(markets)
      .where(
        and(
          eq(markets.tournamentId, tournamentId),
          eq(markets.status, "open"),
          inArray(markets.scope, ["match", "leg"])
        )
      );

    let repriced = 0;
    for (const m of open) {
      if (!m.matchId) continue;
      const [match] = await this.db
        .select()
        .from(matches)
        .where(eq(matches.id, m.matchId));
      if (!match?.playerAId || !match.playerBId) continue;
      const [pA] = await this.db
        .select()
        .from(players)
        .where(eq(players.id, match.playerAId));
      const [pB] = await this.db
        .select()
        .from(players)
        .where(eq(players.id, match.playerBId));
      if (!pA || !pB) continue;

      const probs = selectionProbabilities(
        m.type,
        winProbability(pA.eloRating, pB.eloRating),
        match.bestOf,
        pA.id,
        pB.id
      );
      if (!probs) continue;

      for (const sel of await this.getSelections(m.id)) {
        const p = probs(sel);
        if (p === null) continue;
        await this.db
          .update(marketSelections)
          .set({ statOdds: openingOdds(p, odds).toFixed(4) })
          .where(eq(marketSelections.id, sel.id));
      }
      // Rebuilds finalOdds (and pariOdds) off the statOdds just written.
      await this.recomputeOdds(m.id);
      repriced++;
    }
    return repriced;
  }

  private async insertMarket(
    market: typeof markets.$inferInsert,
    selections: SelectionDraft[],
    cfg: TournamentConfig
  ): Promise<void> {
    const [m] = await this.db.insert(markets).values(market).returning();
    if (!m) throw new Error("failed to insert market");
    const odds = resolveOddsConfig(cfg);
    const rows = selections.map((s) => {
      const stat = openingOdds(s.probability, odds);
      return {
        marketId: m.id,
        label: s.label,
        playerId: s.playerId,
        scoreA: s.scoreA,
        scoreB: s.scoreB,
        statOdds: stat.toFixed(4),
        pariOdds: null,
        finalOdds: stat.toFixed(4),
      };
    });
    if (rows.length > 0) {
      await this.db.insert(marketSelections).values(rows);
    }
  }
}

/**
 * Opening price for a modelled probability, held inside the configured
 * band. Long-shot correct-score legs used to seed at a literal 999.0; every
 * opening price now lives in the same band the live kurz does.
 */
function openingOdds(probability: number, odds: OddsBalanceConfig): number {
  const raw =
    probability > 0 && probability < 1
      ? probabilityToOdds(probability, odds.houseEdge)
      : probability >= 1
        ? odds.minOdds
        : odds.maxOdds;
  return clampOdds(raw, odds.minOdds, odds.maxOdds);
}

/**
 * How to read a modelled probability off each selection of a market, given
 * the pair's per-leg win probability. Returns null for market types that
 * aren't derived from a head-to-head match (the tournament futures, which
 * need a fresh Monte Carlo run rather than a re-price).
 */
function selectionProbabilities(
  marketType: Market["type"],
  pAWinsLeg: number,
  bestOf: number,
  playerAId: string,
  playerBId: string
): ((sel: MarketSelection) => number | null) | null {
  switch (marketType) {
    case "match_winner": {
      const pA = matchWinProbabilityFromLegProb(pAWinsLeg, bestOf);
      return (sel) =>
        sel.playerId === playerAId
          ? pA
          : sel.playerId === playerBId
            ? 1 - pA
            : null;
    }
    case "leg_winner":
      return (sel) =>
        sel.playerId === playerAId
          ? pAWinsLeg
          : sel.playerId === playerBId
            ? 1 - pAWinsLeg
            : null;
    case "correct_score": {
      const dist = correctScoreDistribution(pAWinsLeg, bestOf);
      return (sel) => dist.get(`${sel.scoreA}:${sel.scoreB}`) ?? null;
    }
    default:
      return null;
  }
}

/**
 * Convert per-leg win probability to per-match win probability for
 * best-of-N. Equivalent to summing the path probabilities where the
 * favored player reaches ceil(N/2) wins first.
 */
function matchWinProbabilityFromLegProb(pA: number, bestOf: number): number {
  if (bestOf % 2 === 0) throw new Error("bestOf must be odd");
  const target = Math.ceil(bestOf / 2);
  let total = 0;
  for (let losses = 0; losses < target; losses++) {
    const totalLegs = target + losses;
    total += binom(totalLegs - 1, losses) * Math.pow(pA, target) * Math.pow(1 - pA, losses);
  }
  return total;
}

function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let acc = 1;
  for (let i = 1; i <= k; i++) acc = (acc * (n - k + i)) / i;
  return acc;
}

function toSimConfig(cfg: TournamentConfig): SimConfig {
  return {
    groupCount: cfg.groupCount,
    groupSize: cfg.groupSize,
    advancePerGroup: cfg.advancePerGroup,
    bestOfGroup: cfg.bestOfGroup,
    bestOfQuarter: cfg.bestOfQuarter,
    bestOfSemi: cfg.bestOfSemi,
    bestOfFinal: cfg.bestOfFinal,
    thirdPlaceMatch: cfg.thirdPlaceMatch,
  };
}

// never feed 0 to probabilityToOdds; floor at a small epsilon relative to field size
function clampProb(p: number | undefined, fieldSize: number): number {
  const floor = 1 / (fieldSize * 50);
  return Math.min(0.999, Math.max(floor, p ?? 1 / fieldSize));
}

import { db } from "@/db/client";
export const marketService = new MarketService(db);
