import { notFound } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { matches, legs, players, groups } from "@/db/schema";
import { tournamentService } from "@/lib/tournament";
import { MatchRow, type Match as MatchVM } from "@/components/admin/MatchRow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PHASE_ORDER: Record<string, number> = {
  group: 0,
  quarter: 1,
  semi: 2,
  third_place: 3,
  final: 4,
};

export default async function MatchesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await tournamentService.get(id);
  if (!t) notFound();

  const groupRows = await db
    .select()
    .from(groups)
    .where(eq(groups.tournamentId, id))
    .orderBy(asc(groups.position));
  const groupMap = new Map(groupRows.map((g) => [g.id, g]));
  const groupPos = new Map(groupRows.map((g) => [g.id, g.position]));

  const allMatches = await db
    .select()
    .from(matches)
    .where(eq(matches.tournamentId, id));

  const playerIds = Array.from(
    new Set(
      allMatches
        .flatMap((m) => [m.playerAId, m.playerBId])
        .filter((x): x is string => !!x)
    )
  );
  const playerRows = playerIds.length
    ? await db.select().from(players).where(inArray(players.id, playerIds))
    : [];
  const playerMap = new Map(playerRows.map((p) => [p.id, p]));

  const matchIds = allMatches.map((m) => m.id);
  const allLegs = matchIds.length
    ? await db
        .select()
        .from(legs)
        .where(inArray(legs.matchId, matchIds))
        .orderBy(asc(legs.legNumber))
    : [];
  const legsByMatch = new Map<string, typeof allLegs>();
  for (const l of allLegs) {
    const arr = legsByMatch.get(l.matchId) ?? [];
    arr.push(l);
    legsByMatch.set(l.matchId, arr);
  }

  // Global play order
  const sorted = [...allMatches].sort((a, b) => {
    const phase = (PHASE_ORDER[a.phase] ?? 99) - (PHASE_ORDER[b.phase] ?? 99);
    if (phase !== 0) return phase;
    if (a.groupId && b.groupId) {
      const g = (groupPos.get(a.groupId) ?? 0) - (groupPos.get(b.groupId) ?? 0);
      if (g !== 0) return g;
    }
    const r = (a.bracketRound ?? 0) - (b.bracketRound ?? 0);
    if (r !== 0) return r;
    return (a.bracketPosition ?? 0) - (b.bracketPosition ?? 0);
  });
  const numberById = new Map(sorted.map((m, i) => [m.id, i + 1]));

  const vms: (MatchVM & { groupName: string | null; number: number })[] = sorted.map((m) => ({
    id: m.id,
    phase: m.phase,
    bestOf: m.bestOf,
    status: m.status,
    scoreA: m.scoreA,
    scoreB: m.scoreB,
    playerA: m.playerAId
      ? { id: m.playerAId, name: playerMap.get(m.playerAId)!.name }
      : null,
    playerB: m.playerBId
      ? { id: m.playerBId, name: playerMap.get(m.playerBId)!.name }
      : null,
    winnerId: m.winnerId,
    legs: (legsByMatch.get(m.id) ?? []).map((l) => ({
      id: l.id,
      legNumber: l.legNumber,
      status: l.status,
      winnerId: l.winnerId,
    })),
    groupName: m.groupId ? groupMap.get(m.groupId)?.name ?? null : null,
    number: numberById.get(m.id)!,
  }));

  const groupMatches = vms.filter((m) => m.phase === "group");
  const groupedByGroup = new Map<string, typeof groupMatches>();
  for (const m of groupMatches) {
    const key = m.groupName ?? "?";
    const arr = groupedByGroup.get(key) ?? [];
    arr.push(m);
    groupedByGroup.set(key, arr);
  }

  const playoffPhases = ["quarter", "semi", "third_place", "final"] as const;
  const playoffByPhase = new Map<string, typeof vms>();
  for (const phase of playoffPhases) {
    const arr = vms.filter((m) => m.phase === phase);
    if (arr.length > 0) playoffByPhase.set(phase, arr);
  }

  const finishedCount = vms.filter((m) => m.status === "finished").length;
  const liveCount = vms.filter((m) => m.status === "live").length;

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">{t.name} — Zápasy</h1>
        <p className="text-sm text-muted-foreground">
          {finishedCount}/{vms.length} dohráno
          {liveCount > 0 && <span className="text-foreground"> · {liveCount} živě</span>}
        </p>
      </div>
      {[...groupedByGroup.entries()].map(([name, ms]) => (
        <Card key={`group-${name}`}>
          <CardHeader>
            <CardTitle>Skupina {name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ms.map((m) => (
              <MatchRow key={m.id} tournamentId={id} match={m} number={m.number} />
            ))}
          </CardContent>
        </Card>
      ))}
      {[...playoffByPhase.entries()].map(([phase, ms]) => (
        <Card key={`p-${phase}`}>
          <CardHeader>
            <CardTitle>{labelPhase(phase)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ms.map((m) => (
              <MatchRow key={m.id} tournamentId={id} match={m} number={m.number} />
            ))}
          </CardContent>
        </Card>
      ))}
      {vms.length === 0 && (
        <p className="text-muted-foreground">Žádné zápasy. Nejprve spusť skupinovou fázi.</p>
      )}
    </div>
  );
}

function labelPhase(phase: string): string {
  switch (phase) {
    case "quarter":
      return "Čtvrtfinále";
    case "semi":
      return "Semifinále";
    case "third_place":
      return "O 3. místo";
    case "final":
      return "Finále";
    default:
      return phase;
  }
}
