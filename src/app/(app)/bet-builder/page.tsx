import { redirect } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db/client";
import {
  legs,
  marketSelections,
  markets as marketsTable,
  matches,
  players,
  users,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { tournamentService } from "@/lib/tournament";
import { BetBuilder, type BuilderMarketVM } from "@/components/betting/BetBuilder";

const MATCH_MARKET_TITLES: Record<string, string> = {
  match_winner: "Vítěz zápasu",
  correct_score: "Přesný výsledek",
  leg_winner: "Leg",
};
const TOURNAMENT_MARKET_TITLES: Record<string, string> = {
  tournament_winner: "Vítěz turnaje",
  tournament_runner_up: "2. místo",
  tournament_third: "3. místo",
};
const PHASE_LABEL: Record<string, string> = {
  group: "Skupina",
  quarter: "Čtvrtfinále",
  semi: "Semifinále",
  third_place: "O 3. místo",
  final: "Finále",
};

export default async function BetBuilderPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = await tournamentService.getActive();
  if (!t) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Bet builder</h1>
        <Card>
          <CardHeader>
            <CardTitle>Žádný aktivní turnaj</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Bet builder se otevře, jakmile admin spustí turnaj.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [me] = await db
    .select({ capital: users.capital })
    .from(users)
    .where(eq(users.id, session.user.id));
  const capital = Number(me?.capital ?? 0);
  const maxStakePct = t.configJson.maxStakePct;

  // All open markets for the active tournament.
  const openMarkets = await db
    .select()
    .from(marketsTable)
    .where(
      and(
        eq(marketsTable.tournamentId, t.id),
        eq(marketsTable.status, "open")
      )
    )
    .orderBy(asc(marketsTable.scope), asc(marketsTable.opensAt));

  if (openMarkets.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Bet builder</h1>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Žádné otevřené trhy. Vrať se až bude turnaj v plném proudu.
          </CardContent>
        </Card>
      </div>
    );
  }

  const marketIds = openMarkets.map((m) => m.id);
  const sels = await db
    .select()
    .from(marketSelections)
    .where(inArray(marketSelections.marketId, marketIds));

  const matchIds = Array.from(
    new Set(openMarkets.map((m) => m.matchId).filter((x): x is string => !!x))
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

  const legIds = openMarkets
    .map((m) => m.legId)
    .filter((x): x is string => !!x);
  const legRows = legIds.length
    ? await db.select().from(legs).where(inArray(legs.id, legIds))
    : [];
  const legNumberById = new Map(legRows.map((l) => [l.id, l.legNumber]));

  // Build VMs grouped under their match (or "Sázky na turnaj" for futures).
  type GroupKey = string;
  const groups = new Map<
    GroupKey,
    {
      label: string;
      sublabel: string | null;
      sortKey: number;
      markets: BuilderMarketVM[];
    }
  >();

  for (const m of openMarkets) {
    const mySels = sels
      .filter((s) => s.marketId === m.id)
      .map((s) => ({
        id: s.id,
        label: s.label,
        finalOdds: Number(s.finalOdds),
      }));
    if (mySels.length === 0) continue;

    let groupKey: GroupKey;
    let label: string;
    let sublabel: string | null = null;
    let sortKey: number;
    let marketTitle: string;

    if (m.matchId) {
      const match = matchById.get(m.matchId);
      if (!match) continue;
      const a = match.playerAId ? playerById.get(match.playerAId) ?? "?" : "?";
      const b = match.playerBId ? playerById.get(match.playerBId) ?? "?" : "?";
      groupKey = `match:${match.id}`;
      label = `${a} vs ${b}`;
      sublabel = PHASE_LABEL[match.phase] ?? match.phase;
      sortKey = match.status === "live" ? 0 : 1;
      const legNum = m.legId ? legNumberById.get(m.legId) ?? 0 : 0;
      marketTitle =
        MATCH_MARKET_TITLES[m.type] === "Leg" && legNum
          ? `Leg ${legNum} — vítěz`
          : MATCH_MARKET_TITLES[m.type] ?? m.type;
    } else {
      groupKey = "tournament";
      label = "Sázky na celý turnaj";
      sublabel = "Futures";
      sortKey = 2;
      marketTitle = TOURNAMENT_MARKET_TITLES[m.type] ?? m.type;
    }

    let g = groups.get(groupKey);
    if (!g) {
      g = { label, sublabel, sortKey, markets: [] };
      groups.set(groupKey, g);
    }
    g.markets.push({
      id: m.id,
      title: marketTitle,
      selections: mySels,
    });
  }

  const groupList = [...groups.entries()]
    .map(([key, g]) => ({ key, ...g }))
    .sort((a, b) => a.sortKey - b.sortKey || a.label.localeCompare(b.label, "cs"));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Bet builder</h1>
        <p className="text-sm text-muted-foreground">
          Skládej více výběrů do akumulátoru. Kurzy se vynásobí, ale stačí
          jedna chyba a celá sázka padá.
        </p>
      </div>
      <BetBuilder
        groups={groupList}
        capital={capital}
        maxStakePct={maxStakePct}
      />
    </div>
  );
}
