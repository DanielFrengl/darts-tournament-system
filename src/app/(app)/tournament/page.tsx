import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, inArray, sum } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { db } from "@/db/client";
import {
  bets,
  marketSelections,
  markets as marketsTable,
  users,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { marketService } from "@/lib/market";
import { tournamentService } from "@/lib/tournament";
import {
  buildGroupViews,
  buildBracketMatches,
  buildMatchList,
} from "@/lib/tournament-views";
import { GroupTable } from "@/components/tournament/GroupTable";
import { BracketView } from "@/components/tournament/BracketView";
import { MatchListCard } from "@/components/tournament/MatchListCard";
import { MarketCard, type MarketCardVM } from "@/components/betting/MarketCard";
import { TournamentLiveSync } from "@/components/tournament/TournamentLiveSync";
import { LiveDot } from "@/components/ui/live-dot";

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

  // Idempotent: ensures 2nd/3rd place markets exist for tournaments
  // that were started before those market types were introduced.
  if (t.status !== "finished") {
    await marketService.createTournamentPlaces(t.id);
  }

  const groupViews = await buildGroupViews(t.id, t.configJson);
  const bracketMatches = await buildBracketMatches(t.id);
  const matchList = await buildMatchList(t.id);
  const futuresMarkets = await loadTournamentFutures(t.id);
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
      <PageHeader title={t.name}>
        <StatusBadge kind="tournament" status={t.status} />
      </PageHeader>

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
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <LiveDot />
            Živě
          </h2>
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

      {futuresMarkets.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Sázky na celý turnaj</h2>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Vítěz · 2. místo · 3. místo
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {futuresMarkets.map((vm) => (
              <MarketCard
                key={vm.id}
                market={vm}
                matchId={""}
                capital={capital}
                maxStakePct={maxStakePct}
                canBet={vm.status === "open" && capital > 0}
              />
            ))}
          </div>
        </section>
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
    </div>
  );
}

const TOURNAMENT_MARKET_TITLES: Record<string, string> = {
  tournament_winner: "Vítěz turnaje",
  tournament_runner_up: "2. místo",
  tournament_third: "3. místo",
};
const TOURNAMENT_MARKET_ORDER: Record<string, number> = {
  tournament_winner: 0,
  tournament_runner_up: 1,
  tournament_third: 2,
};

async function loadTournamentFutures(tournamentId: string): Promise<MarketCardVM[]> {
  const ms = await db
    .select()
    .from(marketsTable)
    .where(
      and(
        eq(marketsTable.tournamentId, tournamentId),
        eq(marketsTable.scope, "tournament")
      )
    );
  if (ms.length === 0) return [];
  const marketIds = ms.map((m) => m.id);
  const sels = await db
    .select()
    .from(marketSelections)
    .where(inArray(marketSelections.marketId, marketIds));
  const selIds = sels.map((s) => s.id);

  const poolPerSel = new Map<string, number>();
  if (selIds.length) {
    const poolRows = await db
      .select({ selectionId: bets.selectionId, total: sum(bets.stake) })
      .from(bets)
      .where(and(inArray(bets.selectionId, selIds), eq(bets.status, "open")))
      .groupBy(bets.selectionId);
    for (const r of poolRows) poolPerSel.set(r.selectionId, Number(r.total ?? 0));
  }

  const vms = ms.map((m) => {
    const mySels = sels
      .filter((s) => s.marketId === m.id)
      .map((s) => ({
        id: s.id,
        label: s.label,
        finalOdds: Number(s.finalOdds),
        isWinner: s.isWinner ?? null,
        pool: poolPerSel.get(s.id) ?? 0,
      }));
    const totalPool = mySels.reduce((a, s) => a + s.pool, 0);
    return {
      id: m.id,
      title: TOURNAMENT_MARKET_TITLES[m.type] ?? m.type,
      status: m.status,
      selections: mySels,
      totalPool,
      _order: TOURNAMENT_MARKET_ORDER[m.type] ?? 99,
    };
  });
  vms.sort((a, b) => a._order - b._order);
  return vms.map(({ _order, ...rest }) => {
    void _order;
    return rest;
  });
}

