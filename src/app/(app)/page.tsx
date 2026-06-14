import Link from "next/link";
import { redirect } from "next/navigation";
import { and, count, desc, eq, sum } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { db } from "@/db/client";
import { bets, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { displayName } from "@/lib/names";
import { tournamentService } from "@/lib/tournament";
import { buildMatchList } from "@/lib/tournament-views";
import { userStats } from "@/lib/user-stats";
import { MatchListCard } from "@/components/tournament/MatchListCard";
import { TournamentLiveSync } from "@/components/tournament/TournamentLiveSync";
import { LiveDot } from "@/components/ui/live-dot";
import { HowItWorks } from "@/components/layout/HowItWorks";

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
      <div className="space-y-6">
        <PageHeader title="Dashboard" />
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
  const leaderboard = await buildTopLeaderboard(t.id, 5);

  return (
    <div className="space-y-6">
      <TournamentLiveSync tournamentId={t.id} />
      <PageHeader title={t.name}>
        <StatusBadge kind="tournament" status={t.status} />
      </PageHeader>
      {stats}
      {Number(openBets) === 0 && settledCount === 0 && (
        <HowItWorks startingCapital={t.configJson.startingCapital} />
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="lg:order-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              {live.length > 0 && <LiveDot />}
              {live.length > 0 ? "Živě & nadcházející" : "Sázej hned"}
            </CardTitle>
            <Button variant="outline" render={<Link href="/tournament">Vše ›</Link>} />
          </CardHeader>
          <CardContent>
            {featured.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Žádné zápasy ke sledování.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
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

        <Card className="lg:order-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Žebříček</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/leaderboard">Celý ›</Link>}
            />
          </CardHeader>
          <CardContent>
            {leaderboard.length === 0 ? (
              <p className="text-sm text-muted-foreground">Žádné sázky zatím.</p>
            ) : (
              <ol className="space-y-1.5">
                {leaderboard.map((row, i) => (
                  <li key={row.userId}>
                    <Link
                      href={`/u/${row.username}`}
                      className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
                    >
                      <span className="w-5 text-center font-mono text-sm text-muted-foreground">
                        {i + 1}
                      </span>
                      <Avatar className="h-7 w-7">
                        {row.avatarUrl && (
                          <AvatarImage src={row.avatarUrl} alt={row.displayName} />
                        )}
                        <AvatarFallback className="text-[10px]">
                          {row.displayName.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {row.displayName}
                      </span>
                      <span
                        className={`font-mono text-sm font-semibold tabular-nums ${
                          row.netProfit > 0
                            ? "text-emerald-500"
                            : row.netProfit < 0
                              ? "text-destructive"
                              : ""
                        }`}
                      >
                        {row.netProfit > 0 ? "+" : ""}
                        {fmtCompact(row.netProfit)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const compactFmt = new Intl.NumberFormat("cs-CZ", {
  notation: "compact",
  maximumFractionDigits: 1,
});
function fmtCompact(n: number): string {
  return compactFmt.format(n);
}

async function buildTopLeaderboard(tournamentId: string, limit: number) {
  const allUsers = await db
    .select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .orderBy(desc(users.capital));
  const rows = await Promise.all(
    allUsers.map(async (u) => {
      const s = await userStats(u.id, tournamentId);
      return {
        userId: u.id,
        username: u.username,
        displayName: displayName(u),
        avatarUrl: u.avatarUrl,
        netProfit: s.netProfit,
        betCount: s.betCount,
      };
    })
  );
  return rows
    .filter((r) => r.betCount > 0)
    .sort((a, b) => b.netProfit - a.netProfit)
    .slice(0, limit);
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
