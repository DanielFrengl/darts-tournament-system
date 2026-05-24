import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { groups, matches, players, type Player } from "@/db/schema";
import { computeStandings, type FinishedMatch } from "@/lib/match";
import type { GroupTableRow } from "@/components/tournament/GroupTable";
import type { BracketMatchVM } from "@/components/tournament/BracketView";
import type { TournamentConfig } from "@/lib/tournament-config";

export type GroupView = {
  groupId: string;
  groupName: string;
  rows: GroupTableRow[];
};

export async function buildGroupViews(
  tournamentId: string,
  cfg: TournamentConfig
): Promise<GroupView[]> {
  const groupRows = await db
    .select()
    .from(groups)
    .where(eq(groups.tournamentId, tournamentId))
    .orderBy(asc(groups.position));
  if (groupRows.length === 0) return [];

  const allPlayers = await db
    .select()
    .from(players)
    .where(eq(players.tournamentId, tournamentId));
  const playerById = new Map<string, Player>(allPlayers.map((p) => [p.id, p]));

  const groupIds = groupRows.map((g) => g.id);
  const groupMatches = groupIds.length
    ? await db
        .select()
        .from(matches)
        .where(inArray(matches.groupId, groupIds))
    : [];

  const out: GroupView[] = [];
  for (const g of groupRows) {
    const groupPlayers = allPlayers.filter((p) => p.groupId === g.id);
    const finished = groupMatches
      .filter((m) => m.groupId === g.id && m.status === "finished")
      .map<FinishedMatch>((m) => ({
        playerAId: m.playerAId!,
        playerBId: m.playerBId!,
        scoreA: m.scoreA,
        scoreB: m.scoreB,
      }));
    const standings = computeStandings(
      groupPlayers.map((p) => p.id),
      finished
    );
    const rows: GroupTableRow[] = standings.map((s, idx) => ({
      rank: idx + 1,
      playerId: s.playerId,
      playerName: playerById.get(s.playerId)?.name ?? "?",
      played: s.played,
      won: s.won,
      lost: s.lost,
      legsFor: s.legsFor,
      legsAgainst: s.legsAgainst,
      points: s.points,
      advancing: idx < cfg.advancePerGroup,
    }));
    out.push({ groupId: g.id, groupName: g.name, rows });
  }
  return out;
}

export async function buildBracketMatches(tournamentId: string): Promise<BracketMatchVM[]> {
  const playoffMatches = await db
    .select()
    .from(matches)
    .where(eq(matches.tournamentId, tournamentId))
    .orderBy(asc(matches.bracketPosition));
  const relevant = playoffMatches.filter((m) => m.phase !== "group");
  if (relevant.length === 0) return [];
  const playerIds = Array.from(
    new Set(
      relevant
        .flatMap((m) => [m.playerAId, m.playerBId])
        .filter((x): x is string => !!x)
    )
  );
  const playerRows = playerIds.length
    ? await db.select().from(players).where(inArray(players.id, playerIds))
    : [];
  const playerMap = new Map(playerRows.map((p) => [p.id, p]));

  return relevant.map((m) => ({
    id: m.id,
    phase: m.phase as BracketMatchVM["phase"],
    bracketPosition: m.bracketPosition ?? 0,
    playerA: m.playerAId
      ? { id: m.playerAId, name: playerMap.get(m.playerAId)?.name ?? "?" }
      : null,
    playerB: m.playerBId
      ? { id: m.playerBId, name: playerMap.get(m.playerBId)?.name ?? "?" }
      : null,
    scoreA: m.scoreA,
    scoreB: m.scoreB,
    status: m.status,
    winnerId: m.winnerId,
  }));
}
