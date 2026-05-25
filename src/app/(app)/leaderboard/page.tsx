import Link from "next/link";
import { and, count, desc, eq, sum } from "drizzle-orm";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { db } from "@/db/client";
import { bets, markets, marketSelections, users } from "@/db/schema";
import { displayName } from "@/lib/names";
import { tournamentService } from "@/lib/tournament";
import {
  LeaderboardCharts,
  type LeaderboardRow,
} from "@/components/leaderboard/LeaderboardCharts";

async function statsFor(userId: string, tournamentId?: string) {
  // Build a fragment that filters bets by tournament when needed by
  // joining through marketSelections → markets → tournament.
  const baseSelect = () => {
    if (tournamentId) {
      return db
        .select({ value: count() })
        .from(bets)
        .innerJoin(marketSelections, eq(marketSelections.id, bets.selectionId))
        .innerJoin(markets, eq(markets.id, marketSelections.marketId));
    }
    return db.select({ value: count() }).from(bets);
  };
  const baseSum = (col: typeof bets.stake | typeof bets.payout) => {
    if (tournamentId) {
      return db
        .select({ value: sum(col) })
        .from(bets)
        .innerJoin(marketSelections, eq(marketSelections.id, bets.selectionId))
        .innerJoin(markets, eq(markets.id, marketSelections.marketId));
    }
    return db.select({ value: sum(col) }).from(bets);
  };
  const scope = (extra?: ReturnType<typeof eq>) => {
    const parts = [eq(bets.userId, userId)];
    if (tournamentId) parts.push(eq(markets.tournamentId, tournamentId));
    if (extra) parts.push(extra);
    return and(...parts);
  };

  const [countRow] = await baseSelect().where(scope());
  const [wonRow] = await baseSelect().where(scope(eq(bets.status, "won")));
  const [lostRow] = await baseSelect().where(scope(eq(bets.status, "lost")));
  const [refundedRow] = await baseSelect().where(scope(eq(bets.status, "refunded")));
  const [openRow] = await baseSelect().where(scope(eq(bets.status, "open")));
  const [stakeRow] = await baseSum(bets.stake).where(scope());
  const [payoutWonRow] = await baseSum(bets.payout).where(scope(eq(bets.status, "won")));
  const [payoutRefundRow] = await baseSum(bets.payout).where(
    scope(eq(bets.status, "refunded"))
  );

  const totalStaked = Number(stakeRow?.value ?? 0);
  const totalReturn = Number(payoutWonRow?.value ?? 0) + Number(payoutRefundRow?.value ?? 0);
  const won = Number(wonRow?.value ?? 0);
  const lost = Number(lostRow?.value ?? 0);
  const refunded = Number(refundedRow?.value ?? 0);
  const open = Number(openRow?.value ?? 0);
  const settled = won + lost;

  return {
    totalStaked,
    totalReturn,
    netProfit: totalReturn - totalStaked,
    roi: totalStaked > 0 ? ((totalReturn - totalStaked) / totalStaked) * 100 : null,
    betCount: Number(countRow?.value ?? 0),
    won,
    lost,
    refunded,
    open,
    winRate: settled > 0 ? (won / settled) * 100 : null,
  };
}

type FullRow = LeaderboardRow & { avatarUrl: string | null };

async function buildRows(tournamentId?: string): Promise<FullRow[]> {
  const userRows = await db
    .select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarUrl: users.avatarUrl,
      capital: users.capital,
    })
    .from(users)
    .orderBy(desc(users.capital));

  const rows: FullRow[] = [];
  for (const u of userRows) {
    const s = await statsFor(u.id, tournamentId);
    rows.push({
      userId: u.id,
      username: u.username,
      displayName: displayName(u),
      avatarUrl: u.avatarUrl,
      capital: Number(u.capital),
      ...s,
    });
  }
  rows.sort((a, b) => b.netProfit - a.netProfit || b.capital - a.capital);
  return rows;
}

export default async function LeaderboardPage() {
  const active = await tournamentService.getActive();
  const tournamentRows = active ? await buildRows(active.id) : [];
  const allTimeRows = await buildRows();

  const defaultTab = active ? "current" : "all";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Žebříček</h1>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="current" disabled={!active}>
            {active ? `Aktuální turnaj — ${active.name}` : "Aktuální turnaj"}
          </TabsTrigger>
          <TabsTrigger value="all">Celkově (vše)</TabsTrigger>
        </TabsList>

        {active && (
          <TabsContent value="current" className="space-y-6">
            <LeaderboardView rows={tournamentRows} scopeLabel="v aktuálním turnaji" />
          </TabsContent>
        )}

        <TabsContent value="all" className="space-y-6">
          <LeaderboardView rows={allTimeRows} scopeLabel="napříč všemi turnaji" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LeaderboardView({
  rows,
  scopeLabel,
}: {
  rows: FullRow[];
  scopeLabel: string;
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Porovnání hráčů</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Žádní hráči s daty.</p>
          ) : (
            <LeaderboardCharts rows={rows} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tabulka {scopeLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          <LeaderboardTable rows={rows} />
        </CardContent>
      </Card>
    </>
  );
}

function LeaderboardTable({ rows }: { rows: FullRow[] }) {
  const fmt = new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return (
    <div className="-mx-2 overflow-x-auto sm:mx-0">
      <Table className="min-w-[640px]">
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Hráč</TableHead>
            <TableHead className="text-right">Sázek</TableHead>
            <TableHead className="text-right">Výhry</TableHead>
            <TableHead className="text-right">Prohry</TableHead>
            <TableHead className="text-right">Úspěšnost</TableHead>
            <TableHead className="text-right">Obrat</TableHead>
            <TableHead className="text-right">ROI</TableHead>
            <TableHead className="text-right">Zisk</TableHead>
            <TableHead className="text-right">Kapitál</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.userId}>
              <TableCell className="font-mono">{i + 1}</TableCell>
              <TableCell>
                <Link
                  href={`/u/${r.username}`}
                  className="flex items-center gap-2 hover:underline"
                >
                  <Avatar className="h-6 w-6">
                    {r.avatarUrl && <AvatarImage src={r.avatarUrl} alt={r.displayName} />}
                    <AvatarFallback>
                      {r.displayName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{r.displayName}</span>
                </Link>
              </TableCell>
              <TableCell className="text-right">{r.betCount}</TableCell>
              <TableCell className="text-right text-emerald-400">{r.won}</TableCell>
              <TableCell className="text-right text-destructive/80">{r.lost}</TableCell>
              <TableCell className="text-right font-mono">
                {r.winRate != null ? `${r.winRate.toFixed(0)}%` : "—"}
              </TableCell>
              <TableCell className="text-right font-mono">
                {fmt.format(r.totalStaked)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {r.roi != null ? (
                  <span
                    className={
                      r.roi > 0
                        ? "text-emerald-400"
                        : r.roi < 0
                          ? "text-destructive"
                          : ""
                    }
                  >
                    {r.roi > 0 ? "+" : ""}
                    {r.roi.toFixed(1)}%
                  </span>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="text-right font-mono">
                <Badge
                  variant={
                    r.netProfit > 0
                      ? "default"
                      : r.netProfit < 0
                        ? "destructive"
                        : "secondary"
                  }
                  className={
                    r.netProfit > 0
                      ? "border-transparent bg-emerald-500/20 text-emerald-400"
                      : undefined
                  }
                >
                  {r.netProfit > 0 ? "+" : ""}
                  {fmt.format(r.netProfit)}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono">
                {fmt.format(r.capital)}
                <span className="ml-1 text-xs text-muted-foreground">Chips</span>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={10} className="text-center text-muted-foreground">
                Žádní uživatelé
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
