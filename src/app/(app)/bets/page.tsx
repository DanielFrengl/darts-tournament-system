import { redirect } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db/client";
import {
  bets,
  marketSelections,
  markets,
  matches,
  players,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { MyBetsTable, type BetRowVM } from "@/components/betting/MyBetsTable";

export default async function MyBetsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userBets = await db
    .select()
    .from(bets)
    .where(eq(bets.userId, session.user.id))
    .orderBy(desc(bets.placedAt))
    .limit(100);

  if (userBets.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Moje sázky</h1>
        <Card>
          <CardHeader>
            <CardTitle>Žádné sázky</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Zatím jsi nevsadil. Vyber zápas v turnaji a klikni na kurz.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectionIds = userBets.map((b) => b.selectionId);
  const sels = await db
    .select()
    .from(marketSelections)
    .where(inArray(marketSelections.id, selectionIds));
  const marketIds = Array.from(new Set(sels.map((s) => s.marketId)));
  const marketRows = marketIds.length
    ? await db.select().from(markets).where(inArray(markets.id, marketIds))
    : [];
  const matchIds = Array.from(
    new Set(marketRows.map((m) => m.matchId).filter((x): x is string => !!x))
  );
  const matchRows = matchIds.length
    ? await db.select().from(matches).where(inArray(matches.id, matchIds))
    : [];
  const playerIds = Array.from(
    new Set(matchRows.flatMap((m) => [m.playerAId, m.playerBId]).filter((x): x is string => !!x))
  );
  const playerRows = playerIds.length
    ? await db.select().from(players).where(inArray(players.id, playerIds))
    : [];
  const playerById = new Map(playerRows.map((p) => [p.id, p.name]));
  const matchById = new Map(matchRows.map((m) => [m.id, m]));
  const marketById = new Map(marketRows.map((m) => [m.id, m]));
  const selectionById = new Map(sels.map((s) => [s.id, s]));

  const rows: BetRowVM[] = userBets.map((b) => {
    const sel = selectionById.get(b.selectionId);
    const market = sel ? marketById.get(sel.marketId) : undefined;
    const match = market?.matchId ? matchById.get(market.matchId) : undefined;
    const matchSummary = match
      ? `${playerById.get(match.playerAId ?? "") ?? "?"} vs ${
          playerById.get(match.playerBId ?? "") ?? "?"
        }`
      : "—";
    return {
      id: b.id,
      placedAt: b.placedAt,
      marketLabel:
        market?.type === "match_winner"
          ? "Vítěz zápasu"
          : market?.type === "correct_score"
            ? "Přesný výsledek"
            : market?.type === "leg_winner"
              ? "Leg"
              : "?",
      selectionLabel: sel?.label ?? "?",
      matchId: market?.matchId ?? null,
      matchSummary,
      stake: b.stake,
      lockedOdds: b.lockedOdds,
      status: b.status,
      payout: b.payout,
    };
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Moje sázky</h1>
      <Card>
        <CardContent className="pt-6">
          <MyBetsTable rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
