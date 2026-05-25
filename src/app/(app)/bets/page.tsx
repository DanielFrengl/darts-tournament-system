import { redirect } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db/client";
import { bets, marketSelections, markets, matches, players } from "@/db/schema";
import { auth } from "@/lib/auth";
import { BetsByMatch, type MatchGroupVM, type BetEntry } from "@/components/betting/BetsByMatch";

const PHASE_LABEL: Record<string, string> = {
  group: "Skupina",
  quarter: "Čtvrtfinále",
  semi: "Semifinále",
  third_place: "O 3. místo",
  final: "Finále",
};

export default async function MyBetsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userBets = await db
    .select()
    .from(bets)
    .where(eq(bets.userId, session.user.id))
    .orderBy(desc(bets.placedAt))
    .limit(200);

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
              Zatím jsi nevsadil. Otevři Turnaj a klikni na kurz vedle hráče.
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
    new Set(
      matchRows.flatMap((m) => [m.playerAId, m.playerBId]).filter((x): x is string => !!x)
    )
  );
  const playerRows = playerIds.length
    ? await db.select().from(players).where(inArray(players.id, playerIds))
    : [];
  const playerById = new Map(playerRows.map((p) => [p.id, p.name]));
  const matchById = new Map(matchRows.map((m) => [m.id, m]));
  const marketById = new Map(marketRows.map((m) => [m.id, m]));
  const selectionById = new Map(sels.map((s) => [s.id, s]));

  type GroupKey = string;
  const grouped = new Map<GroupKey, MatchGroupVM>();
  const orphans: BetEntry[] = [];

  for (const b of userBets) {
    const sel = selectionById.get(b.selectionId);
    const market = sel ? marketById.get(sel.marketId) : undefined;
    const match = market?.matchId ? matchById.get(market.matchId) : undefined;
    const entry: BetEntry = {
      id: b.id,
      placedAt: b.placedAt,
      marketLabel: marketLabel(market?.type),
      selectionLabel: sel?.label ?? "?",
      stake: b.stake,
      lockedOdds: b.lockedOdds,
      status: b.status,
      payout: b.payout,
    };

    if (!match) {
      // Tournament-scope bet (e.g., tournament_winner) — group separately.
      const key = market ? `__market_${market.id}__` : "__no_match__";
      let g = grouped.get(key);
      if (!g) {
        g = {
          matchId: null,
          matchSummary: market
            ? marketTitle(market.type)
            : "Bez zápasu",
          matchScore: null,
          matchStatus: null,
          phaseLabel: null,
          bets: [],
          totalStake: 0,
          totalReturn: 0,
          netResult: 0,
        };
        grouped.set(key, g);
      }
      g.bets.push(entry);
      continue;
    }

    const key = match.id;
    let g = grouped.get(key);
    if (!g) {
      const nameA = match.playerAId ? playerById.get(match.playerAId) ?? "?" : "?";
      const nameB = match.playerBId ? playerById.get(match.playerBId) ?? "?" : "?";
      g = {
        matchId: match.id,
        matchSummary: `${nameA} vs ${nameB}`,
        matchScore: `${match.scoreA} : ${match.scoreB}`,
        matchStatus: match.status,
        phaseLabel: PHASE_LABEL[match.phase] ?? null,
        bets: [],
        totalStake: 0,
        totalReturn: 0,
        netResult: 0,
      };
      grouped.set(key, g);
    }
    g.bets.push(entry);
    void orphans;
  }

  // Aggregate stake / return per group
  for (const g of grouped.values()) {
    for (const b of g.bets) {
      g.totalStake += Number(b.stake);
      if (b.status === "won" || b.status === "refunded") {
        g.totalReturn += Number(b.payout ?? 0);
      }
    }
    g.netResult = g.totalReturn - g.totalStake;
  }

  // Open bets first, then settled — within each, most recent first.
  const groupList = [...grouped.values()].sort((a, b) => {
    const aOpen = a.bets.some((x) => x.status === "open") ? 0 : 1;
    const bOpen = b.bets.some((x) => x.status === "open") ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    const aLatest = Math.max(...a.bets.map((x) => x.placedAt.getTime()));
    const bLatest = Math.max(...b.bets.map((x) => x.placedAt.getTime()));
    return bLatest - aLatest;
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Moje sázky</h1>
      <BetsByMatch groups={groupList} />
    </div>
  );
}

function marketLabel(type: string | undefined): string {
  switch (type) {
    case "match_winner":
      return "Vítěz zápasu";
    case "correct_score":
      return "Přesný výsledek";
    case "leg_winner":
      return "Leg";
    case "tournament_winner":
      return "Vítěz turnaje";
    case "tournament_runner_up":
      return "2. místo turnaje";
    case "tournament_third":
      return "3. místo turnaje";
    default:
      return type ?? "?";
  }
}

function marketTitle(type: string): string {
  switch (type) {
    case "tournament_winner":
      return "Vítěz turnaje";
    default:
      return marketLabel(type);
  }
}
