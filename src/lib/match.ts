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

// Group standings live in their own pure module so the Monte Carlo
// simulation can rank simulated groups by the same rules. Re-exported here
// because this is where callers have always imported them from.
export {
  computeStandings,
  type FinishedMatch,
  type StandingRow,
} from "@/lib/standings";

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
