import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { db } from "@/db/client";
import { matches, legs, players, groups } from "@/db/schema";
import { tournamentService } from "@/lib/tournament";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MatchRow, type Match as MatchVM } from "@/components/admin/MatchRow";
import { WizardNav } from "@/components/admin/WizardNav";

const PHASE_ORDER: Record<string, number> = {
  group: 0,
  quarter: 1,
  semi: 2,
  third_place: 3,
  final: 4,
};

const PHASE_LABEL: Record<string, string> = {
  group: "Skupina",
  quarter: "Čtvrtfinále",
  semi: "Semifinále",
  third_place: "O 3. místo",
  final: "Finále",
};

export default async function PlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const { id } = await params;
  const { m: focusedId } = await searchParams;
  const t = await tournamentService.get(id);
  if (!t) notFound();

  // Load groups + matches + players + legs together to build the play list.
  const groupRows = await db
    .select()
    .from(groups)
    .where(eq(groups.tournamentId, id))
    .orderBy(asc(groups.position));
  const groupMap = new Map(groupRows.map((g) => [g.id, g]));

  const allMatches = await db
    .select()
    .from(matches)
    .where(eq(matches.tournamentId, id));
  if (allMatches.length === 0) {
    return (
      <div className="space-y-4">
        <WizardNav
          back={{ href: `/admin/tournaments/${id}`, label: "Zpět na přehled" }}
        />
        <h1 className="text-2xl font-semibold">{t.name} — Skórování</h1>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Zatím nejsou žádné zápasy. Spusť nejdřív skupinovou fázi.
          </CardContent>
        </Card>
      </div>
    );
  }

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
  const allLegs = await db
    .select()
    .from(legs)
    .where(inArray(legs.matchId, matchIds))
    .orderBy(asc(legs.legNumber));
  const legsByMatch = new Map<string, typeof allLegs>();
  for (const l of allLegs) {
    const arr = legsByMatch.get(l.matchId) ?? [];
    arr.push(l);
    legsByMatch.set(l.matchId, arr);
  }

  // Sort by play order: phase → group position → bracket round → bracket position.
  const groupPos = new Map(groupRows.map((g) => [g.id, g.position]));
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

  // Pick the focused match: explicit ?m=, else live one, else first scheduled, else last.
  const live = sorted.find((mm) => mm.status === "live");
  const nextUp = sorted.find((mm) => mm.status === "scheduled" && mm.playerAId && mm.playerBId);
  const focused =
    sorted.find((mm) => mm.id === focusedId) ?? live ?? nextUp ?? sorted[sorted.length - 1]!;
  const focusedIndex = sorted.findIndex((mm) => mm.id === focused.id);

  // Auto-redirect when there's no specific match requested but a better
  // candidate exists. Keeps the URL stable for sharing/bookmarking.
  if (!focusedId && (live || nextUp)) {
    const targetId = live?.id ?? nextUp?.id;
    if (targetId && targetId !== focused.id) {
      redirect(`/admin/tournaments/${id}/play?m=${targetId}`);
    }
  }

  const focusedVm: MatchVM & { groupName: string | null; number: number } = {
    id: focused.id,
    phase: focused.phase,
    bestOf: focused.bestOf,
    status: focused.status,
    scoreA: focused.scoreA,
    scoreB: focused.scoreB,
    playerA: focused.playerAId
      ? { id: focused.playerAId, name: playerMap.get(focused.playerAId)!.name }
      : null,
    playerB: focused.playerBId
      ? { id: focused.playerBId, name: playerMap.get(focused.playerBId)!.name }
      : null,
    winnerId: focused.winnerId,
    legs: (legsByMatch.get(focused.id) ?? []).map((l) => ({
      id: l.id,
      legNumber: l.legNumber,
      status: l.status,
      winnerId: l.winnerId,
    })),
    groupName: focused.groupId ? groupMap.get(focused.groupId)?.name ?? null : null,
    number: focusedIndex + 1,
  };

  const prev = focusedIndex > 0 ? sorted[focusedIndex - 1]! : null;
  const next = focusedIndex < sorted.length - 1 ? sorted[focusedIndex + 1]! : null;

  const finishedCount = sorted.filter((m) => m.status === "finished").length;
  const liveCount = sorted.filter((m) => m.status === "live").length;

  // Mini list of upcoming + finished for context (limited).
  const queue = sorted
    .filter((m) => m.status === "scheduled")
    .slice(0, 6);
  const recent = sorted
    .filter((m) => m.status === "finished")
    .reverse()
    .slice(0, 5);

  return (
    <div className="space-y-4">
      <WizardNav
        back={{ href: `/admin/tournaments/${id}`, label: "Zpět na přehled" }}
      />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t.name}</h1>
        <p className="text-sm text-muted-foreground">
          {finishedCount}/{sorted.length} dohráno
          {liveCount > 0 && <span className="text-foreground"> · {liveCount} živě</span>}
        </p>
      </div>

      <Card className="border-foreground/20">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline">#{focusedIndex + 1}</Badge>
            {focusedVm.groupName && (
              <Badge variant="secondary">Skupina {focusedVm.groupName}</Badge>
            )}
            <Badge variant="outline">{PHASE_LABEL[focusedVm.phase] ?? focusedVm.phase}</Badge>
          </div>
          <CardTitle className="text-sm font-normal text-muted-foreground">
            {focusedIndex + 1} / {sorted.length}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MatchRow tournamentId={id} match={focusedVm} number={focusedIndex + 1} />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!prev}
          render={
            prev ? (
              <Link href={`/admin/tournaments/${id}/play?m=${prev.id}`}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                Předchozí
              </Link>
            ) : (
              <span />
            )
          }
        />
        <Button
          variant="outline"
          size="sm"
          disabled={!next}
          render={
            next ? (
              <Link href={`/admin/tournaments/${id}/play?m=${next.id}`}>
                Další
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            ) : (
              <span />
            )
          }
        />
      </div>

      {queue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ve frontě</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {queue.map((m) => {
                const idx = sorted.findIndex((x) => x.id === m.id);
                const a = m.playerAId ? playerMap.get(m.playerAId)?.name ?? "?" : "?";
                const b = m.playerBId ? playerMap.get(m.playerBId)?.name ?? "?" : "?";
                return (
                  <li key={m.id}>
                    <Link
                      href={`/admin/tournaments/${id}/play?m=${m.id}`}
                      className="flex items-center justify-between gap-2 py-2 hover:bg-accent/40"
                    >
                      <span className="flex items-center gap-2">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                          #{idx + 1}
                        </span>
                        <span>
                          {a} <span className="text-muted-foreground">vs</span> {b}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {PHASE_LABEL[m.phase] ?? m.phase}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Naposled dohráno</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {recent.map((m) => {
                const idx = sorted.findIndex((x) => x.id === m.id);
                const a = m.playerAId ? playerMap.get(m.playerAId)?.name ?? "?" : "?";
                const b = m.playerBId ? playerMap.get(m.playerBId)?.name ?? "?" : "?";
                return (
                  <li key={m.id}>
                    <Link
                      href={`/admin/tournaments/${id}/play?m=${m.id}`}
                      className="flex items-center justify-between gap-2 py-2 hover:bg-accent/40"
                    >
                      <span className="flex items-center gap-2">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                          #{idx + 1}
                        </span>
                        <span>
                          {a} <span className="font-mono">{m.scoreA}:{m.scoreB}</span> {b}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
