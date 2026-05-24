import Link from "next/link";
import { desc, eq, sum, and } from "drizzle-orm";
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
import { db } from "@/db/client";
import { bets, users } from "@/db/schema";

type Row = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  capital: string;
  totalStaked: number;
  totalReturn: number;
  netProfit: number;
  betCount: number;
};

export default async function LeaderboardPage() {
  const userRows = await db
    .select({
      id: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      capital: users.capital,
    })
    .from(users)
    .orderBy(desc(users.capital));

  // Compute net profit per user from bets table. Net profit = sum(payout)
  // for settled bets minus sum(stake) of those same bets.
  const rows: Row[] = [];
  for (const u of userRows) {
    const [staked] = await db
      .select({ s: sum(bets.stake), c: sum(bets.lockedOdds) })
      .from(bets)
      .where(eq(bets.userId, u.id));
    const [payouts] = await db
      .select({ p: sum(bets.payout) })
      .from(bets)
      .where(and(eq(bets.userId, u.id), eq(bets.status, "won")));
    const [refunds] = await db
      .select({ p: sum(bets.payout) })
      .from(bets)
      .where(and(eq(bets.userId, u.id), eq(bets.status, "refunded")));
    const totalStaked = Number(staked?.s ?? 0);
    const totalReturn = Number(payouts?.p ?? 0) + Number(refunds?.p ?? 0);
    const betRows = await db.select({ id: bets.id }).from(bets).where(eq(bets.userId, u.id));
    rows.push({
      userId: u.id,
      username: u.username,
      avatarUrl: u.avatarUrl,
      capital: u.capital,
      totalStaked,
      totalReturn,
      netProfit: totalReturn - totalStaked,
      betCount: betRows.length,
    });
    void staked?.c;
  }
  rows.sort((a, b) => b.netProfit - a.netProfit || Number(b.capital) - Number(a.capital));

  const fmt = new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Žebříček</h1>
      <Card>
        <CardHeader>
          <CardTitle>Podle čistého zisku ze sázek</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Hráč</TableHead>
                <TableHead className="text-right">Sázek</TableHead>
                <TableHead className="text-right">Vsazeno</TableHead>
                <TableHead className="text-right">Vyplaceno</TableHead>
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
                        {r.avatarUrl && <AvatarImage src={r.avatarUrl} alt={r.username} />}
                        <AvatarFallback>{r.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{r.username}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">{r.betCount}</TableCell>
                  <TableCell className="text-right font-mono">{fmt.format(r.totalStaked)}</TableCell>
                  <TableCell className="text-right font-mono">{fmt.format(r.totalReturn)}</TableCell>
                  <TableCell className="text-right font-mono">
                    <Badge
                      variant={r.netProfit > 0 ? "default" : r.netProfit < 0 ? "destructive" : "secondary"}
                    >
                      {r.netProfit > 0 ? "+" : ""}
                      {fmt.format(r.netProfit)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{fmt.format(Number(r.capital))}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Žádní uživatelé
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
