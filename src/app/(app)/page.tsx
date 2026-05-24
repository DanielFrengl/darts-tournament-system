import Link from "next/link";
import { asc, eq, inArray, and } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db/client";
import { matches, players } from "@/db/schema";
import { tournamentService } from "@/lib/tournament";

export default async function DashboardPage() {
  const t = await tournamentService.getActive();
  if (!t) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Card>
          <CardHeader>
            <CardTitle>Vítej</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Aktivní turnaj zatím není. Až ho admin založí, objeví se zde přehled.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const upcomingScheduled = await db
    .select()
    .from(matches)
    .where(and(eq(matches.tournamentId, t.id), eq(matches.status, "scheduled")))
    .orderBy(asc(matches.bracketRound), asc(matches.bracketPosition))
    .limit(5);
  const liveMatches = await db
    .select()
    .from(matches)
    .where(and(eq(matches.tournamentId, t.id), eq(matches.status, "live")))
    .limit(5);
  const featured = [...liveMatches, ...upcomingScheduled].slice(0, 5);

  const playerIds = Array.from(
    new Set(
      featured.flatMap((m) => [m.playerAId, m.playerBId]).filter((x): x is string => !!x)
    )
  );
  const playerRows = playerIds.length
    ? await db.select().from(players).where(inArray(players.id, playerIds))
    : [];
  const nameById = new Map(playerRows.map((p) => [p.id, p.name]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t.name}</h1>
        <Badge variant="outline">{t.status}</Badge>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Nejbližší zápasy</CardTitle>
          <Button variant="outline" render={<Link href="/tournament">Přehled turnaje</Link>} />
        </CardHeader>
        <CardContent>
          {featured.length === 0 ? (
            <p className="text-sm text-muted-foreground">Žádné zápasy ke sledování.</p>
          ) : (
            <ul className="space-y-2">
              {featured.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between rounded border p-2"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant={m.status === "live" ? "default" : "secondary"}>
                      {m.status}
                    </Badge>
                    <Link href={`/match/${m.id}`} className="text-sm underline-offset-2 hover:underline">
                      {nameById.get(m.playerAId ?? "") ?? "?"} vs{" "}
                      {nameById.get(m.playerBId ?? "") ?? "?"}
                    </Link>
                  </div>
                  <span className="font-mono text-sm">
                    {m.scoreA} : {m.scoreB}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
