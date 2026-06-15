import { and, asc, eq } from "drizzle-orm";
import { matches, groups, players, tournaments, type Match } from "@/db/schema";
import type { DB } from "@/db/client";
import type { TournamentConfig } from "@/lib/tournament-config";
import { computeStandings, type FinishedMatch } from "@/lib/match";

export type GroupAdvancers = { groupName: string; players: string[] };

type BracketMatch = {
  phase: Match["phase"];
  bracketRound: number;
  bracketPosition: number;
  playerAId: string;
  playerBId: string;
};

const PHASE_BY_REMAINING: Record<number, Match["phase"]> = {
  2: "final",
  4: "semi",
  8: "quarter",
};

/**
 * Cross-seeded bracket generator. Builds only the first round of the
 * bracket; subsequent rounds are created when winners are advanced.
 *
 * For 2 groups: pairing pattern is A1 vs B(N), B1 vs A(N), A2 vs B(N-1), ...
 */
export function seedBracket(advancers: GroupAdvancers[]): BracketMatch[] {
  const total = advancers.reduce((acc, g) => acc + g.players.length, 0);
  if (total < 2) throw new Error("need at least 2 advancers");
  if (total % 2 !== 0) throw new Error("total advancers must be even");
  if ((total & (total - 1)) !== 0) {
    throw new Error("total advancers must be a power of 2");
  }
  const phase = PHASE_BY_REMAINING[total];
  if (!phase) throw new Error("unsupported bracket size");

  if (advancers.length !== 2 && advancers.length !== 4) {
    throw new Error("only 2 or 4 group brackets are supported in this phase");
  }

  const out: BracketMatch[] = [];

  if (advancers.length === 4) {
    const [a, b, c, d] = advancers;
    const perGroup = a!.players.length;
    if (b!.players.length !== perGroup || c!.players.length !== perGroup || d!.players.length !== perGroup) {
      throw new Error("groups must advance the same number of players");
    }

    if (perGroup === 1) {
      // 4 advancers (semi)
      out.push({ phase, bracketRound: 1, bracketPosition: 0, playerAId: a!.players[0]!, playerBId: c!.players[0]! });
      out.push({ phase, bracketRound: 1, bracketPosition: 1, playerAId: b!.players[0]!, playerBId: d!.players[0]! });
    } else if (perGroup === 2) {
      // 8 advancers (quarter)
      out.push({ phase, bracketRound: 1, bracketPosition: 0, playerAId: a!.players[0]!, playerBId: b!.players[1]! });
      out.push({ phase, bracketRound: 1, bracketPosition: 1, playerAId: c!.players[0]!, playerBId: d!.players[1]! });
      out.push({ phase, bracketRound: 1, bracketPosition: 2, playerAId: b!.players[0]!, playerBId: a!.players[1]! });
      out.push({ phase, bracketRound: 1, bracketPosition: 3, playerAId: d!.players[0]!, playerBId: c!.players[1]! });
    } else {
      throw new Error("only up to 2 advancers per group are supported for 4 groups currently");
    }
    return out;
  }

  const [a, b] = advancers as [GroupAdvancers, GroupAdvancers];
  const perGroup = a.players.length;
  if (b.players.length !== perGroup) {
    throw new Error("groups must advance the same number of players");
  }

  const half = Math.ceil(perGroup / 2);
  for (let i = 0; i < half; i++) {
    const aSeed = a.players[i]!;
    const bAnti = b.players[perGroup - 1 - i]!;
    out.push({
      phase,
      bracketRound: 1,
      bracketPosition: out.length,
      playerAId: aSeed,
      playerBId: bAnti,
    });
    if (i !== perGroup - 1 - i) {
      const bSeed = b.players[i]!;
      const aAnti = a.players[perGroup - 1 - i]!;
      out.push({
        phase,
        bracketRound: 1,
        bracketPosition: out.length,
        playerAId: bSeed,
        playerBId: aAnti,
      });
    }
  }
  return out;
}

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
