import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { tournamentService } from "@/lib/tournament";
import {
  buildGroupViews,
  buildBracketMatches,
  buildMatchList,
} from "@/lib/tournament-views";
import { GroupTable } from "@/components/tournament/GroupTable";
import { BracketView } from "@/components/tournament/BracketView";
import { MatchListCard } from "@/components/tournament/MatchListCard";
import { TournamentLiveSync } from "@/components/tournament/TournamentLiveSync";

export default async function TournamentOverviewPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const [me] = await db
    .select({ capital: users.capital })
    .from(users)
    .where(eq(users.id, session.user.id));
  const capital = Number(me?.capital ?? 0);

  const t = await tournamentService.getActive();
  if (!t) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Žádný aktivní turnaj</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Až admin spustí turnaj, objeví se zde.</p>
        </CardContent>
      </Card>
    );
  }

  const groupViews = await buildGroupViews(t.id, t.configJson);
  const bracketMatches = await buildBracketMatches(t.id);
  const matchList = await buildMatchList(t.id);
  const showBracket = t.status === "playoff" || t.status === "finished";
  const live = matchList.filter((m) => m.status === "live");
  const upcoming = matchList.filter((m) => m.status === "scheduled");
  const finished = matchList.filter(
    (m) => m.status === "finished" || m.status === "cancelled"
  );

  const maxStakePct = t.configJson.maxStakePct;

  return (
    <div className="space-y-6">
      <TournamentLiveSync tournamentId={t.id} />
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">{t.name}</h1>
        <Badge variant="outline" className="text-base">
          {statusLabel(t.status)}
        </Badge>
      </div>

      {capital <= 0 && t.status !== "finished" && (
        <Card className="border-yellow-500/40 bg-yellow-500/5">
          <CardContent className="pt-6 text-sm">
            Máš kapitál 0 — k sázení potřebuješ aspoň 1. Admin ti ho přidělí přes
            Admin → Uživatelé.
          </CardContent>
        </Card>
      )}

      {live.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">🔴 Živě</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {live.map((m) => (
              <MatchListCard
                key={m.id}
                match={m}
                capital={capital}
                maxStakePct={maxStakePct}
                canBet={capital > 0}
              />
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Nadcházející</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {upcoming.slice(0, 6).map((m) => (
              <MatchListCard
                key={m.id}
                match={m}
                capital={capital}
                maxStakePct={maxStakePct}
                canBet={capital > 0}
              />
            ))}
          </div>
          {upcoming.length > 6 && (
            <p className="text-sm text-muted-foreground">
              + dalších {upcoming.length - 6} naplánovaných
            </p>
          )}
        </section>
      )}

      {groupViews.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Tabulky skupin</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {groupViews.map((g) => (
              <GroupTable key={g.groupId} groupName={g.groupName} rows={g.rows} />
            ))}
          </CardContent>
        </Card>
      )}

      {showBracket && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Pavouk</CardTitle>
            <Button
              variant="outline"
              render={<Link href="/tournament/bracket">Plná velikost</Link>}
            />
          </CardHeader>
          <CardContent>
            <BracketView matches={bracketMatches} />
          </CardContent>
        </Card>
      )}

      {finished.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Odehrané</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {finished.slice(0, 9).map((m) => (
              <MatchListCard
                key={m.id}
                match={m}
                capital={capital}
                maxStakePct={maxStakePct}
                canBet={false}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function statusLabel(s: "draft" | "groups" | "playoff" | "finished"): string {
  switch (s) {
    case "draft":
      return "Příprava";
    case "groups":
      return "Skupiny";
    case "playoff":
      return "Playoff";
    case "finished":
      return "Dohráno";
  }
}
