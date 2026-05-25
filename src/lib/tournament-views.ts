import "server-only";
import { asc, eq, inArray, and, sum } from "drizzle-orm";
import { db } from "@/db/client";
import {
  bets,
  groups,
  matches,
  markets,
  marketSelections,
  players,
  type Player,
} from "@/db/schema";
import { computeStandings, type FinishedMatch } from "@/lib/match";
import type { GroupTableRow } from "@/components/tournament/GroupTable";
import type { BracketMatchVM } from "@/components/tournament/BracketView";
import type { MatchListItem } from "@/components/tournament/MatchListCard";
import type { TournamentConfig } from "@/lib/tournament-config";

const PHASE_LABEL: Record<string, string> = {
  group: "Skupina",
  quarter: "Čtvrtfinále",
  semi: "Semifinále",
  third_place: "O 3. místo",
  final: "Finále",
};

const PHASE_ORDER: Record<string, number> = {
  group: 0,
  quarter: 1,
  semi: 2,
  third_place: 3,
  final: 4,
};

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

/**
 * Build flat ordered list of all matches for the tournament, numbered
 * the way they'll be played: group round-robin first (per group),
 * then quarter, semi, third_place, final. Each card carries the
 * match_winner odds if the market is open, so users can bet from the
 * tournament overview without drilling into the match detail.
 */
export async function buildMatchList(tournamentId: string): Promise<MatchListItem[]> {
  const all = await db
    .select()
    .from(matches)
    .where(eq(matches.tournamentId, tournamentId));
  if (all.length === 0) return [];

  const playerIds = Array.from(
    new Set(
      all.flatMap((m) => [m.playerAId, m.playerBId]).filter((x): x is string => !!x)
    )
  );
  const playerRows = playerIds.length
    ? await db.select().from(players).where(inArray(players.id, playerIds))
    : [];
  const nameById = new Map(playerRows.map((p) => [p.id, p.name]));
  const groupRows = await db
    .select()
    .from(groups)
    .where(eq(groups.tournamentId, tournamentId))
    .orderBy(asc(groups.position));
  const groupPosition = new Map(groupRows.map((g) => [g.id, g.position]));

  const matchIds = all.map((m) => m.id);
  const matchWinnerMarkets = matchIds.length
    ? await db
        .select()
        .from(markets)
        .where(
          and(
            inArray(markets.matchId, matchIds),
            eq(markets.type, "match_winner")
          )
        )
    : [];
  const marketIdToMatch = new Map(matchWinnerMarkets.map((m) => [m.id, m]));
  const marketIds = matchWinnerMarkets.map((m) => m.id);
  const sels = marketIds.length
    ? await db
        .select()
        .from(marketSelections)
        .where(inArray(marketSelections.marketId, marketIds))
    : [];
  const oddsByMatchByPlayer = new Map<
    string,
    Map<string, { odds: number; selectionId: string }>
  >();
  for (const s of sels) {
    const m = marketIdToMatch.get(s.marketId);
    if (!m?.matchId || !s.playerId || m.status !== "open") continue;
    let inner = oddsByMatchByPlayer.get(m.matchId);
    if (!inner) {
      inner = new Map();
      oddsByMatchByPlayer.set(m.matchId, inner);
    }
    inner.set(s.playerId, { odds: Number(s.finalOdds), selectionId: s.id });
  }

  // Total wagered per match across all open match-scoped markets
  const poolPerMatch = new Map<string, number>();
  if (matchIds.length) {
    const matchScopedMarkets = await db
      .select()
      .from(markets)
      .where(and(inArray(markets.matchId, matchIds), eq(markets.scope, "match")));
    const matchScopedIds = matchScopedMarkets.map((m) => m.id);
    if (matchScopedIds.length) {
      const sumRows = await db
        .select({ marketId: marketSelections.marketId, total: sum(bets.stake) })
        .from(bets)
        .innerJoin(marketSelections, eq(marketSelections.id, bets.selectionId))
        .where(
          and(
            inArray(marketSelections.marketId, matchScopedIds),
            eq(bets.status, "open")
          )
        )
        .groupBy(marketSelections.marketId);
      const totalByMarket = new Map(
        sumRows.map((r) => [r.marketId, Number(r.total ?? 0)])
      );
      for (const m of matchScopedMarkets) {
        if (!m.matchId) continue;
        const cur = poolPerMatch.get(m.matchId) ?? 0;
        poolPerMatch.set(m.matchId, cur + (totalByMarket.get(m.id) ?? 0));
      }
    }
  }

  const sorted = [...all].sort((a, b) => {
    const phaseDiff = (PHASE_ORDER[a.phase] ?? 99) - (PHASE_ORDER[b.phase] ?? 99);
    if (phaseDiff !== 0) return phaseDiff;
    if (a.groupId && b.groupId) {
      const gDiff = (groupPosition.get(a.groupId) ?? 0) - (groupPosition.get(b.groupId) ?? 0);
      if (gDiff !== 0) return gDiff;
    }
    const r = (a.bracketRound ?? 0) - (b.bracketRound ?? 0);
    if (r !== 0) return r;
    const p = (a.bracketPosition ?? 0) - (b.bracketPosition ?? 0);
    if (p !== 0) return p;
    return 0;
  });

  return sorted.map((m, idx) => {
    const inner = oddsByMatchByPlayer.get(m.id);
    const a = inner && m.playerAId ? inner.get(m.playerAId) : undefined;
    const b = inner && m.playerBId ? inner.get(m.playerBId) : undefined;
    return {
      id: m.id,
      number: idx + 1,
      phaseLabel: PHASE_LABEL[m.phase] ?? m.phase,
      status: m.status,
      bestOf: m.bestOf,
      playerA: m.playerAId ? nameById.get(m.playerAId) ?? "?" : "?",
      playerB: m.playerBId ? nameById.get(m.playerBId) ?? "?" : "?",
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      winnerSide: m.winnerId
        ? m.winnerId === m.playerAId
          ? "A"
          : m.winnerId === m.playerBId
            ? "B"
            : null
        : null,
      oddsA: a?.odds ?? null,
      oddsB: b?.odds ?? null,
      selectionIdA: a?.selectionId ?? null,
      selectionIdB: b?.selectionId ?? null,
      totalPool: poolPerMatch.get(m.id) ?? 0,
    };
  });
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
