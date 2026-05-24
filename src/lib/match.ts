import { and, eq, asc } from "drizzle-orm";
import { matches, groups, players, tournaments, type Match } from "@/db/schema";
import type { DB } from "@/db/client";
import type { TournamentConfig } from "@/lib/tournament-config";

export type Pairing = [string, string];

/**
 * Round-robin pairings using the circle method.
 * Each unordered pair appears exactly once; the player at position 0
 * stays fixed and the others rotate.
 */
export function generateRoundRobin(playerIds: string[]): Pairing[] {
  if (playerIds.length < 2) return [];
  const ids = [...playerIds];
  const hasBye = ids.length % 2 === 1;
  if (hasBye) ids.push("__BYE__");
  const n = ids.length;
  const rounds = n - 1;
  const half = n / 2;
  const out: Pairing[] = [];

  let rotating = ids.slice(1);
  for (let r = 0; r < rounds; r++) {
    const round = [ids[0]!, ...rotating];
    for (let i = 0; i < half; i++) {
      const a = round[i]!;
      const b = round[n - 1 - i]!;
      if (a !== "__BYE__" && b !== "__BYE__") {
        out.push([a, b]);
      }
    }
    rotating = [rotating[rotating.length - 1]!, ...rotating.slice(0, -1)];
  }
  return out;
}

export type FinishedMatch = {
  playerAId: string;
  playerBId: string;
  scoreA: number;
  scoreB: number;
};

export type StandingRow = {
  playerId: string;
  played: number;
  won: number;
  lost: number;
  points: number;
  legsFor: number;
  legsAgainst: number;
  legDiff: number;
};

const POINTS = {
  win2_0: 3,
  win2_1: 2,
  loss1_2: 1,
  loss0_2: 0,
};

export function computeStandings(
  playerIds: string[],
  finished: FinishedMatch[]
): StandingRow[] {
  const idSet = new Set(playerIds);
  const rows = new Map<string, StandingRow>();
  for (const id of playerIds) {
    rows.set(id, {
      playerId: id,
      played: 0,
      won: 0,
      lost: 0,
      points: 0,
      legsFor: 0,
      legsAgainst: 0,
      legDiff: 0,
    });
  }

  for (const m of finished) {
    if (!idSet.has(m.playerAId) || !idSet.has(m.playerBId)) continue;
    const a = rows.get(m.playerAId)!;
    const b = rows.get(m.playerBId)!;
    a.played++;
    b.played++;
    a.legsFor += m.scoreA;
    a.legsAgainst += m.scoreB;
    b.legsFor += m.scoreB;
    b.legsAgainst += m.scoreA;
    if (m.scoreA > m.scoreB) {
      a.won++;
      b.lost++;
      a.points += m.scoreB === 0 ? POINTS.win2_0 : POINTS.win2_1;
      b.points += m.scoreB === 0 ? POINTS.loss0_2 : POINTS.loss1_2;
    } else {
      b.won++;
      a.lost++;
      b.points += m.scoreA === 0 ? POINTS.win2_0 : POINTS.win2_1;
      a.points += m.scoreA === 0 ? POINTS.loss0_2 : POINTS.loss1_2;
    }
  }

  for (const row of rows.values()) {
    row.legDiff = row.legsFor - row.legsAgainst;
  }

  const h2h = (x: StandingRow, y: StandingRow): number => {
    const direct = finished.find(
      (m) =>
        (m.playerAId === x.playerId && m.playerBId === y.playerId) ||
        (m.playerAId === y.playerId && m.playerBId === x.playerId)
    );
    if (!direct) return 0;
    const xWon =
      (direct.playerAId === x.playerId && direct.scoreA > direct.scoreB) ||
      (direct.playerBId === x.playerId && direct.scoreB > direct.scoreA);
    return xWon ? -1 : 1;
  };

  return [...rows.values()].sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    if (y.legDiff !== x.legDiff) return y.legDiff - x.legDiff;
    return h2h(x, y);
  });
}

export class MatchService {
  constructor(private readonly db: DB) {}

  async listByTournament(tournamentId: string): Promise<Match[]> {
    return this.db
      .select()
      .from(matches)
      .where(eq(matches.tournamentId, tournamentId))
      .orderBy(asc(matches.bracketRound), asc(matches.bracketPosition));
  }

  async listByGroup(groupId: string): Promise<Match[]> {
    return this.db.select().from(matches).where(eq(matches.groupId, groupId));
  }

  async listGroupMatches(tournamentId: string): Promise<Match[]> {
    return this.db
      .select()
      .from(matches)
      .where(and(eq(matches.tournamentId, tournamentId), eq(matches.phase, "group")));
  }

  /**
   * Generates round-robin matches for every group. Idempotent guard:
   * does nothing if any group-phase matches already exist for the
   * tournament. Must be called when tournament is being started.
   */
  async generateGroupMatches(tournamentId: string): Promise<number> {
    const [t] = await this.db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));
    if (!t) throw new Error("tournament not found");
    const existing = await this.listGroupMatches(tournamentId);
    if (existing.length > 0) {
      return 0;
    }
    const cfg = t.configJson as TournamentConfig;
    const groupRows = await this.db
      .select()
      .from(groups)
      .where(eq(groups.tournamentId, tournamentId))
      .orderBy(asc(groups.position));

    let created = 0;
    for (const g of groupRows) {
      const groupPlayers = await this.db
        .select()
        .from(players)
        .where(eq(players.groupId, g.id))
        .orderBy(asc(players.createdAt));
      if (groupPlayers.length < 2) continue;
      const pairs = generateRoundRobin(groupPlayers.map((p) => p.id));
      const toInsert = pairs.map(([aId, bId]) => ({
        tournamentId,
        phase: "group" as const,
        groupId: g.id,
        playerAId: aId,
        playerBId: bId,
        bestOf: cfg.bestOfGroup,
        status: "scheduled" as const,
      }));
      if (toInsert.length > 0) {
        await this.db.insert(matches).values(toInsert);
        created += toInsert.length;
      }
    }
    return created;
  }
}

import { db } from "@/db/client";
export const matchService = new MatchService(db);
