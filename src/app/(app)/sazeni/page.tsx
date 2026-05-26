import { redirect } from "next/navigation";
import { and, asc, desc, eq, inArray, sum } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db/client";
import {
  bets,
  legs,
  marketSelections,
  markets as marketsTable,
  matches,
  parlays,
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
import { type MarketCardVM } from "@/components/betting/MarketCard";
import { BetsByMatch, type MatchGroupVM, type BetEntry } from "@/components/betting/BetsByMatch";
import { BetStatusBadge } from "@/components/betting/BetStatusBadge";
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

const fmt = new Intl.NumberFormat("cs-CZ", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const dt = new Intl.DateTimeFormat("cs-CZ", {
  dateStyle: "short",
  timeStyle: "short",
});

export default async function SazeniPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = await tournamentService.getActive();
  const [me] = await db
    .select({ capital: users.capital })
    .from(users)
    .where(eq(users.id, session.user.id));
  const capital = Number(me?.capital ?? 0);

  // --- Market data (only when tournament is active) -----------------------
  const surfaces = t
    ? await buildBettingSurfaces(t.id)
    : { singleGroups: [], builderGroups: [] };

  // --- My bets data --------------------------------------------------------
  const myBetsData = await loadMyBetsData(session.user.id);

  return (
    <div className="space-y-8">
      {t && <TournamentLiveSync tournamentId={t.id} />}
      <div>
        <h1 className="text-2xl font-semibold">Sázení</h1>
        <p className="text-sm text-muted-foreground">
          Skládej sázky nahoře, sleduj rozjeté dole.
        </p>
      </div>

      {/* --- Place bets section --- */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold uppercase tracking-wider text-muted-foreground">
          Skládej sázku
        </h2>
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
      </section>

      {/* --- My bets section --- */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold uppercase tracking-wider text-muted-foreground">
          Moje sázky
        </h2>
        {myBetsData.parlayCards.length === 0 && myBetsData.groupList.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Zatím jsi nevsadil.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {myBetsData.parlayCards.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Akumulátory
                </h3>
                <div className="space-y-3">
                  {myBetsData.parlayCards.map((p) => (
                    <Card key={p.id}>
                      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">Akumulátor {p.legs.length}×</Badge>
                            <BetStatusBadge status={p.status} />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {dt.format(p.placedAt)}
                          </p>
                        </div>
                        <div className="text-right text-sm">
                          <p>
                            Vklad{" "}
                            <span className="font-mono font-semibold">
                              {fmt.format(p.stake)}
                            </span>
                          </p>
                          <p>
                            Kurz{" "}
                            <span className="font-mono font-semibold text-foreground">
                              {p.lockedOdds.toFixed(2)}
                            </span>
                          </p>
                          {p.payout != null && (
                            <p
                              className={
                                p.status === "won"
                                  ? "text-emerald-400"
                                  : p.status === "refunded"
                                    ? ""
                                    : "text-muted-foreground"
                              }
                            >
                              Výplata{" "}
                              <span className="font-mono font-semibold">
                                {fmt.format(p.payout)}
                              </span>
                            </p>
                          )}
                          {p.status === "open" && (
                            <p className="text-xs text-muted-foreground">
                              Možná výhra{" "}
                              <span className="font-mono">
                                {fmt.format(p.stake * p.lockedOdds)}
                              </span>
                            </p>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <ul className="divide-y divide-border text-sm">
                          {p.legs.map((leg) => (
                            <li
                              key={leg.id}
                              className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                  {leg.context} · {leg.marketLabel}
                                </p>
                                <p className="font-medium">{leg.selectionLabel}</p>
                              </div>
                              <div className="flex items-center gap-3 text-sm">
                                <span className="font-mono text-foreground">
                                  {leg.odds.toFixed(2)}
                                </span>
                                <BetStatusBadge status={leg.status} />
                              </div>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
            {myBetsData.groupList.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Jednotlivé sázky
                </h3>
                <BetsByMatch groups={myBetsData.groupList} />
              </div>
            )}
          </div>
        )}
      </section>
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

  // Aggregated open-bet stake per selection so single-mode cards can show pools.
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

async function loadMyBetsData(userId: string) {
  const singleBets = await db
    .select()
    .from(bets)
    .where(eq(bets.userId, userId))
    .orderBy(desc(bets.placedAt))
    .limit(200);
  const userParlays = await db
    .select()
    .from(parlays)
    .where(eq(parlays.userId, userId))
    .orderBy(desc(parlays.placedAt))
    .limit(100);

  const standaloneBets = singleBets.filter((b) => b.parlayId === null);
  const parlayChildBets = userParlays.length
    ? await db
        .select()
        .from(bets)
        .where(inArray(bets.parlayId, userParlays.map((p) => p.id)))
    : [];

  const allSelectionIds = [
    ...standaloneBets.map((b) => b.selectionId),
    ...parlayChildBets.map((b) => b.selectionId),
  ];
  const sels = allSelectionIds.length
    ? await db
        .select()
        .from(marketSelections)
        .where(inArray(marketSelections.id, allSelectionIds))
    : [];
  const marketIds = Array.from(new Set(sels.map((s) => s.marketId)));
  const marketRows = marketIds.length
    ? await db.select().from(marketsTable).where(inArray(marketsTable.id, marketIds))
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

  const grouped = new Map<string, MatchGroupVM>();
  for (const b of standaloneBets) {
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
      const key = market ? `__market_${market.id}__` : "__no_match__";
      let g = grouped.get(key);
      if (!g) {
        g = {
          matchId: null,
          matchSummary: market ? marketTitle(market.type) : "Bez zápasu",
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
  }
  for (const g of grouped.values()) {
    for (const b of g.bets) {
      g.totalStake += Number(b.stake);
      if (b.status === "won" || b.status === "refunded") {
        g.totalReturn += Number(b.payout ?? 0);
      }
    }
    g.netResult = g.totalReturn - g.totalStake;
  }
  const groupList = [...grouped.values()].sort((a, b) => {
    const aOpen = a.bets.some((x) => x.status === "open") ? 0 : 1;
    const bOpen = b.bets.some((x) => x.status === "open") ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    const aLatest = Math.max(...a.bets.map((x) => x.placedAt.getTime()));
    const bLatest = Math.max(...b.bets.map((x) => x.placedAt.getTime()));
    return bLatest - aLatest;
  });

  const parlayCards = userParlays.map((p) => {
    const children = parlayChildBets.filter((b) => b.parlayId === p.id);
    const legsVM = children.map((b) => {
      const sel = selectionById.get(b.selectionId);
      const market = sel ? marketById.get(sel.marketId) : undefined;
      const match = market?.matchId ? matchById.get(market.matchId) : undefined;
      let context = "";
      if (match) {
        const a = match.playerAId ? playerById.get(match.playerAId) ?? "?" : "?";
        const c = match.playerBId ? playerById.get(match.playerBId) ?? "?" : "?";
        context = `${a} vs ${c}`;
      } else if (market) {
        context = marketTitle(market.type);
      }
      return {
        id: b.id,
        context,
        marketLabel: marketLabel(market?.type),
        selectionLabel: sel?.label ?? "?",
        odds: Number(b.lockedOdds),
        status: b.status,
      };
    });
    return {
      id: p.id,
      stake: Number(p.stake),
      lockedOdds: Number(p.lockedOdds),
      status: p.status,
      payout: p.payout ? Number(p.payout) : null,
      placedAt: p.placedAt,
      legs: legsVM,
    };
  });

  return { parlayCards, groupList };
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
