import Link from "next/link";
import { and, count, eq, gte, sum } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { db } from "@/db/client";
import { users, tournaments, matches, markets, bets, players } from "@/db/schema";
import { tournamentService } from "@/lib/tournament";

async function countOf(query: Promise<{ value: number }[]>): Promise<number> {
  const rows = await query;
  return Number(rows[0]?.value ?? 0);
}

async function sumOf(query: Promise<{ value: string | null }[]>): Promise<number> {
  const rows = await query;
  return Number(rows[0]?.value ?? 0);
}

export default async function AdminDashboard() {
  const userCount = await countOf(db.select({ value: count() }).from(users));
  const tournamentCount = await countOf(db.select({ value: count() }).from(tournaments));
  const t = await tournamentService.getActive();

  const betsToday = await countOf(
    db.select({ value: count() }).from(bets).where(gte(bets.placedAt, startOfToday()))
  );
  const stakeToday = await sumOf(
    db.select({ value: sum(bets.stake) }).from(bets).where(gte(bets.placedAt, startOfToday()))
  );
  const payoutToday = await sumOf(
    db
      .select({ value: sum(bets.payout) })
      .from(bets)
      .where(and(gte(bets.placedAt, startOfToday()), eq(bets.status, "won")))
  );

  let activeStats: {
    name: string;
    status: string;
    players: number;
    matchesDone: number;
    matchesTotal: number;
    openMarkets: number;
    matchesLive: number;
  } | null = null;

  if (t) {
    const playerCount = await countOf(
      db.select({ value: count() }).from(players).where(eq(players.tournamentId, t.id))
    );
    const matchesTotal = await countOf(
      db.select({ value: count() }).from(matches).where(eq(matches.tournamentId, t.id))
    );
    const matchesDone = await countOf(
      db
        .select({ value: count() })
        .from(matches)
        .where(and(eq(matches.tournamentId, t.id), eq(matches.status, "finished")))
    );
    const matchesLive = await countOf(
      db
        .select({ value: count() })
        .from(matches)
        .where(and(eq(matches.tournamentId, t.id), eq(matches.status, "live")))
    );
    const openMarkets = await countOf(
      db
        .select({ value: count() })
        .from(markets)
        .where(and(eq(markets.tournamentId, t.id), eq(markets.status, "open")))
    );
    activeStats = {
      name: t.name,
      status: t.status,
      players: playerCount,
      matchesDone,
      matchesTotal,
      openMarkets,
      matchesLive,
    };
  }

  const fmt = new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Admin přehled" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Uživatelé" value={String(userCount)} />
        <Stat label="Turnaje celkem" value={String(tournamentCount)} />
        <Stat label="Sázek dnes" value={String(betsToday)} />
        <Stat
          label="Obrat dnes"
          value={fmt.format(stakeToday)}
          sub={`Vyplaceno: ${fmt.format(payoutToday)}`}
        />
      </div>

      {activeStats ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle>{activeStats.name}</CardTitle>
              <StatusBadge kind="tournament" status={activeStats.status} />
            </div>
            <Button
              variant="outline"
              render={<Link href={`/admin/tournaments`}>Otevřít</Link>}
            />
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Hráči" value={String(activeStats.players)} />
              <Stat
                label="Zápasy"
                value={`${activeStats.matchesDone}/${activeStats.matchesTotal}`}
                sub={
                  activeStats.matchesLive > 0
                    ? `${activeStats.matchesLive} živě`
                    : undefined
                }
              />
              <Stat label="Otevřené trhy" value={String(activeStats.openMarkets)} />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Žádný aktivní turnaj</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              render={<Link href="/admin/tournaments/new">+ Vytvořit turnaj</Link>}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
