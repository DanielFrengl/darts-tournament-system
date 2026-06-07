import { redirect } from "next/navigation";
import { and, asc, eq, inArray, sum } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/db/client";
import {
  bets,
  legs,
  marketSelections,
  markets as marketsTable,
  matches,
  players,
  users,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { tournamentService } from "@/lib/tournament";
import {
  type BuilderGroupVM,
  type BuilderMarketVM,
} from "@/components/betting/BetBuilder";
import {
  SazeniSurface,
  type SingleGroupVM,
} from "@/components/betting/SazeniSurface";
import { PageHeader } from "@/components/layout/PageHeader";
import { type MarketCardVM } from "@/components/betting/MarketCard";
import { TournamentLiveSync } from "@/components/tournament/TournamentLiveSync";

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

export default async function SazeniPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = await tournamentService.getActive();
  const [me] = await db
    .select({ capital: users.capital })
    .from(users)
    .where(eq(users.id, session.user.id));
  const capital = Number(me?.capital ?? 0);

  const surfaces = t
    ? await buildBettingSurfaces(t.id)
    : { singleGroups: [], builderGroups: [] };

  return (
    <div className="space-y-6">
      {t && <TournamentLiveSync tournamentId={t.id} />}
      <PageHeader
        title="Sázení"
        description="Sázej jednoduše, nebo poskládej akumulátor. Své sázky najdeš v záložce Moje sázky."
      />

      {!t ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Žádný aktivní turnaj.
          </CardContent>
        </Card>
      ) : (
        <SazeniSurface
          singleGroups={surfaces.singleGroups}
          builderGroups={surfaces.builderGroups}
          capital={capital}
          maxStakePct={t.configJson.maxStakePct}
        />
      )}
    </div>
  );
}

async function buildBettingSurfaces(tournamentId: string): Promise<{
  singleGroups: SingleGroupVM[];
  builderGroups: BuilderGroupVM[];
}> {
  const openMarkets = await db
    .select()
    .from(marketsTable)
    .where(
      and(eq(marketsTable.tournamentId, tournamentId), eq(marketsTable.status, "open"))
    )
    .orderBy(asc(marketsTable.scope), asc(marketsTable.opensAt));
  if (openMarkets.length === 0) return { singleGroups: [], builderGroups: [] };

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
  const legIds = openMarkets.map((m) => m.legId).filter((x): x is string => !!x);
  const legRows = legIds.length
    ? await db.select().from(legs).where(inArray(legs.id, legIds))
    : [];
  const legNumberById = new Map(legRows.map((l) => [l.id, l.legNumber]));

  const allSelectionIds = sels.map((s) => s.id);
  const poolPerSelection = new Map<string, number>();
  if (allSelectionIds.length) {
    const sumRows = await db
      .select({ selectionId: bets.selectionId, total: sum(bets.stake) })
      .from(bets)
      .where(
        and(inArray(bets.selectionId, allSelectionIds), eq(bets.status, "open"))
      )
      .groupBy(bets.selectionId);
    for (const r of sumRows) {
      poolPerSelection.set(r.selectionId, Number(r.total ?? 0));
    }
  }

  type GroupAccum = {
    key: string;
    label: string;
    sublabel: string | null;
    sortKey: number;
    matchId: string | null;
    singleMarkets: MarketCardVM[];
    builderMarkets: BuilderMarketVM[];
  };
  const groupsMap = new Map<string, GroupAccum>();

  for (const m of openMarkets) {
    const mySels = sels.filter((s) => s.marketId === m.id);
    if (mySels.length === 0) continue;

    let groupKey: string;
    let label: string;
    let sublabel: string | null = null;
    let sortKey: number;
    let marketTitle: string;
    let groupMatchId: string | null = null;

    if (m.matchId) {
      const match = matchById.get(m.matchId);
      if (!match) continue;
      const a = match.playerAId ? playerById.get(match.playerAId) ?? "?" : "?";
      const b = match.playerBId ? playerById.get(match.playerBId) ?? "?" : "?";
      groupKey = `match:${match.id}`;
      label = `${a} vs ${b}`;
      sublabel = PHASE_LABEL[match.phase] ?? match.phase;
      sortKey = match.status === "live" ? 0 : 1;
      groupMatchId = match.id;
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

    let g = groupsMap.get(groupKey);
    if (!g) {
      g = {
        key: groupKey,
        label,
        sublabel,
        sortKey,
        matchId: groupMatchId,
        singleMarkets: [],
        builderMarkets: [],
      };
      groupsMap.set(groupKey, g);
    }

    const builderSels = mySels.map((s) => ({
      id: s.id,
      label: s.label,
      finalOdds: Number(s.finalOdds),
    }));
    const singleSels = mySels.map((s) => ({
      id: s.id,
      label: s.label,
      finalOdds: Number(s.finalOdds),
      isWinner: s.isWinner ?? null,
      pool: poolPerSelection.get(s.id) ?? 0,
    }));
    const totalPool = singleSels.reduce((acc, s) => acc + s.pool, 0);

    g.singleMarkets.push({
      id: m.id,
      title: marketTitle,
      status: m.status,
      selections: singleSels,
      totalPool,
    });
    g.builderMarkets.push({
      id: m.id,
      title: marketTitle,
      selections: builderSels,
    });
  }

  const ordered = [...groupsMap.values()].sort(
    (a, b) => a.sortKey - b.sortKey || a.label.localeCompare(b.label, "cs")
  );

  return {
    singleGroups: ordered.map((g) => ({
      key: g.key,
      label: g.label,
      sublabel: g.sublabel,
      matchId: g.matchId,
      markets: g.singleMarkets,
    })),
    builderGroups: ordered.map((g) => ({
      key: g.key,
      label: g.label,
      sublabel: g.sublabel,
      markets: g.builderMarkets,
    })),
  };
}
