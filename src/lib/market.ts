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
  blendOdds,
  probabilityToOdds,
} from "@/lib/odds";
import type { TournamentConfig } from "@/lib/tournament-config";
import { simulateTournament, type SimConfig } from "@/lib/tournament-sim";
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
    if (existing.some((m) => m.type === "match_winner")) return;

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

    const sim = simulateTournament(
      tPlayers.map((p) => ({ id: p.id, name: p.name, eloRating: p.eloRating })),
      toSimConfig(cfg),
      { runs: 10000 }
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

    const sim = simulateTournament(
      tPlayers.map((p) => ({ id: p.id, name: p.name, eloRating: p.eloRating })),
      toSimConfig(cfg),
      { runs: 10000 }
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
    const sels = await this.getSelections(marketId);

    const [totalRow] = await this.db
      .select({ total: sum(bets.stake) })
      .from(bets)
      .innerJoin(marketSelections, eq(marketSelections.id, bets.selectionId))
      .where(and(eq(marketSelections.marketId, marketId), eq(bets.status, "open")));
    const totalPool = Number(totalRow?.total ?? 0);

    for (const sel of sels) {
      const [selRow] = await this.db
        .select({ pool: sum(bets.stake) })
        .from(bets)
        .where(and(eq(bets.selectionId, sel.id), eq(bets.status, "open")));
      const poolOnSelection = Number(selRow?.pool ?? 0);
      const pari = parimutuelOdds(totalPool, poolOnSelection, cfg.houseEdge);
      const stat = Number(sel.statOdds);
      const final = blendOdds(stat, pari, totalPool, cfg.parimutuelThreshold);
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

  private async insertMarket(
    market: typeof markets.$inferInsert,
    selections: SelectionDraft[],
    cfg: TournamentConfig
  ): Promise<void> {
    const [m] = await this.db.insert(markets).values(market).returning();
    if (!m) throw new Error("failed to insert market");
    const rows = selections.map((s) => {
      const stat = s.probability > 0 && s.probability < 1
        ? probabilityToOdds(s.probability, cfg.houseEdge)
        : s.probability >= 1
          ? 1.01
          : 999;
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
