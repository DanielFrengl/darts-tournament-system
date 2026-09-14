import { and, asc, eq } from "drizzle-orm";
import { matches, groups, players, tournaments, type Match } from "@/db/schema";
import type { DB } from "@/db/client";
import type { TournamentConfig } from "@/lib/tournament-config";
import { computeStandings, type FinishedMatch } from "@/lib/match";
import { seedBracket, type GroupAdvancers } from "@/lib/bracket-seed";

// The seeding rules themselves are pure and shared with the Monte Carlo
// simulation, so a simulated playoff has the same shape as the real one.
// Re-exported here because this is where callers have always found them.
export {
  seedBracket,
  semifinalOfQuarter,
  type GroupAdvancers,
} from "@/lib/bracket-seed";

export class BracketService {
  constructor(private readonly db: DB) {}

  async computeGroupAdvancers(tournamentId: string): Promise<GroupAdvancers[]> {
    const [t] = await this.db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));
    if (!t) throw new Error("tournament not found");
    const cfg = t.configJson as TournamentConfig;
    const groupRows = await this.db
      .select()
      .from(groups)
      .where(eq(groups.tournamentId, tournamentId))
      .orderBy(asc(groups.position));
    const out: GroupAdvancers[] = [];
    for (const g of groupRows) {
      const groupPlayers = await this.db
        .select()
        .from(players)
        .where(eq(players.groupId, g.id));
      const groupMatches = await this.db
        .select()
        .from(matches)
        .where(and(eq(matches.groupId, g.id), eq(matches.status, "finished")));
      const finished: FinishedMatch[] = groupMatches.map((m) => ({
        playerAId: m.playerAId!,
        playerBId: m.playerBId!,
        scoreA: m.scoreA,
        scoreB: m.scoreB,
      }));
      const standings = computeStandings(
        groupPlayers.map((p) => p.id),
        finished
      );
      out.push({
        groupName: g.name,
        players: standings.slice(0, cfg.advancePerGroup).map((s) => s.playerId),
      });
    }
    return out;
  }

  async createBracket(tournamentId: string): Promise<number> {
    const [t] = await this.db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));
    if (!t) throw new Error("tournament not found");
    const cfg = t.configJson as TournamentConfig;

    const existing = await this.db
      .select()
      .from(matches)
      .where(and(eq(matches.tournamentId, tournamentId), eq(matches.phase, "quarter")));
    if (existing.length > 0) return 0;
    const existingSemis = await this.db
      .select()
      .from(matches)
      .where(and(eq(matches.tournamentId, tournamentId), eq(matches.phase, "semi")));
    if (existingSemis.length > 0) return 0;

    const advancers = await this.computeGroupAdvancers(tournamentId);
    const seeded = seedBracket(advancers);
    const bestOf =
      seeded[0]?.phase === "quarter" ? cfg.bestOfQuarter : cfg.bestOfSemi;

    const inserts = seeded.map((m) => ({
      tournamentId,
      phase: m.phase,
      bracketRound: m.bracketRound,
      bracketPosition: m.bracketPosition,
      playerAId: m.playerAId,
      playerBId: m.playerBId,
      bestOf,
      status: "scheduled" as const,
    }));
    await this.db.insert(matches).values(inserts);
    return inserts.length;
  }

  /**
   * Called after a playoff match finishes. Creates or fills the next
   * round match using the winner. For the final pair-up, this finalizes
   * the tournament.
   */
  async advanceWinner(matchId: string): Promise<void> {
    const [m] = await this.db.select().from(matches).where(eq(matches.id, matchId));
    if (!m) return;
    if (m.phase === "group" || m.phase === "third_place") return;
    if (!m.winnerId) return;

    const [t] = await this.db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, m.tournamentId));
    if (!t) return;
    const cfg = t.configJson as TournamentConfig;

    const currentRoundMatches = await this.db
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.tournamentId, m.tournamentId),
          eq(matches.phase, m.phase),
          eq(matches.bracketRound, m.bracketRound ?? 1)
        )
      );
    const remaining = currentRoundMatches.length;
    const nextPhase: Match["phase"] | null =
      m.phase === "quarter" ? "semi" : m.phase === "semi" ? "final" : null;
    if (!nextPhase) return;

    const allFinished = currentRoundMatches.every((x) => x.status === "finished");
    if (!allFinished) return;

    const existingNext = await this.db
      .select()
      .from(matches)
      .where(and(eq(matches.tournamentId, m.tournamentId), eq(matches.phase, nextPhase)));
    if (existingNext.length > 0) return;

    const sorted = [...currentRoundMatches].sort(
      (x, y) => (x.bracketPosition ?? 0) - (y.bracketPosition ?? 0)
    );
    const winners = sorted.map((x) => x.winnerId).filter((id): id is string => !!id);
    const bestOf = nextPhase === "final" ? cfg.bestOfFinal : cfg.bestOfSemi;
    const inserts: typeof matches.$inferInsert[] = [];
    for (let i = 0; i < winners.length; i += 2) {
      inserts.push({
        tournamentId: m.tournamentId,
        phase: nextPhase,
        bracketRound: 1,
        bracketPosition: i / 2,
        playerAId: winners[i],
        playerBId: winners[i + 1],
        bestOf,
        status: "scheduled",
      });
    }
    if (inserts.length > 0) {
      await this.db.insert(matches).values(inserts);
    }

    if (
      nextPhase === "final" &&
      cfg.thirdPlaceMatch &&
      m.phase === "semi" &&
      currentRoundMatches.length === 2
    ) {
      const losers = sorted
        .map((x) =>
          x.winnerId === x.playerAId ? x.playerBId : x.playerAId
        )
        .filter((id): id is string => !!id);
      if (losers.length === 2) {
        await this.db.insert(matches).values({
          tournamentId: m.tournamentId,
          phase: "third_place",
          bracketRound: 1,
          bracketPosition: 0,
          playerAId: losers[0],
          playerBId: losers[1],
          bestOf: cfg.bestOfSemi,
          status: "scheduled",
        });
      }
    }
    void remaining;
  }
}

import { db } from "@/db/client";
export const bracketService = new BracketService(db);
