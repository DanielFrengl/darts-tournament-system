import Link from "next/link";
import { redirect } from "next/navigation";
import { and, count, eq, sum } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db/client";
import { bets, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { tournamentService } from "@/lib/tournament";
import { buildMatchList } from "@/lib/tournament-views";
import { MatchListCard } from "@/components/tournament/MatchListCard";
import { TournamentLiveSync } from "@/components/tournament/TournamentLiveSync";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [me] = await db
    .select({ capital: users.capital })
    .from(users)
    .where(eq(users.id, session.user.id));
  const capital = Number(me?.capital ?? 0);

  const openBetsRows = await db
    .select({ value: count() })
    .from(bets)
    .where(and(eq(bets.userId, session.user.id), eq(bets.status, "open")));
  const openBets = openBetsRows[0]?.value ?? 0;

  const openStakeRows = await db
    .select({ value: sum(bets.stake) })
    .from(bets)
    .where(and(eq(bets.userId, session.user.id), eq(bets.status, "open")));
  const openStake = Number(openStakeRows[0]?.value ?? 0);

  const wonRows = await db
    .select({ value: count() })
    .from(bets)
    .where(and(eq(bets.userId, session.user.id), eq(bets.status, "won")));
  const wonCount = wonRows[0]?.value ?? 0;

  const lostRows = await db
    .select({ value: count() })
    .from(bets)
    .where(and(eq(bets.userId, session.user.id), eq(bets.status, "lost")));
  const lostCount = lostRows[0]?.value ?? 0;

  const totalStakeRows = await db
    .select({ value: sum(bets.stake) })
    .from(bets)
    .where(eq(bets.userId, session.user.id));
  const totalStake = Number(totalStakeRows[0]?.value ?? 0);

  const totalPayoutRows = await db
    .select({ value: sum(bets.payout) })
    .from(bets)
    .where(and(eq(bets.userId, session.user.id), eq(bets.status, "won")));
  const totalPayout = Number(totalPayoutRows[0]?.value ?? 0);
  const netProfit = totalPayout - totalStake;
  const settledCount = Number(wonCount) + Number(lostCount);
  const winRate = settledCount > 0 ? Number(wonCount) / settledCount : null;

  const t = await tournamentService.getActive();

  const stats = (
    <PersonalStats
      capital={capital}
      openBets={Number(openBets)}
      openStake={openStake}
      netProfit={netProfit}
      winRate={winRate}
      settledCount={settledCount}
    />
  );

  if (!t) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        {stats}
        <Card>
          <CardHeader>
            <CardTitle>Žádný aktivní turnaj</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Až admin spustí turnaj, objeví se zde přehled zápasů a sázek.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const matchList = await buildMatchList(t.id);
  const live = matchList.filter((m) => m.status === "live");
  const upcoming = matchList.filter((m) => m.status === "scheduled").slice(0, 3);
  const featured = [...live, ...upcoming];

  return (
    <div className="space-y-6">
      <TournamentLiveSync tournamentId={t.id} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t.name}</h1>
        <Badge variant="outline">{t.status}</Badge>
      </div>
      {stats}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Sázej hned</CardTitle>
          <Button variant="outline" render={<Link href="/tournament">Vše ›</Link>} />
        </CardHeader>
        <CardContent>
          {featured.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Žádné zápasy ke sledování.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {featured.map((m) => (
                <MatchListCard
                  key={m.id}
                  match={m}
                  capital={capital}
                  maxStakePct={t.configJson.maxStakePct}
                  canBet={capital > 0}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PersonalStats({
  capital,
  openBets,
  openStake,
  netProfit,
  winRate,
  settledCount,
}: {
  capital: number;
  openBets: number;
  openStake: number;
  netProfit: number;
  winRate: number | null;
  settledCount: number;
}) {
  const fmt = new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Kapitál" value={fmt.format(capital)} />
      <Stat
        label="Otevřené sázky"
        value={String(openBets)}
        sub={openStake > 0 ? `Vsazeno: ${fmt.format(openStake)}` : undefined}
      />
      <Stat
        label="Čistý zisk"
        value={`${netProfit > 0 ? "+" : ""}${fmt.format(netProfit)}`}
        tone={netProfit > 0 ? "positive" : netProfit < 0 ? "negative" : "neutral"}
      />
      <Stat
        label="Úspěšnost"
        value={winRate != null ? `${(winRate * 100).toFixed(0)}%` : "—"}
        sub={settledCount > 0 ? `${settledCount} vyhodnocených` : undefined}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-500"
      : tone === "negative"
        ? "text-destructive"
        : "";
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
