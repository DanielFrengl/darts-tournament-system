import { redirect } from "next/navigation";
import { desc, eq, inArray, isNull } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db/client";
import {
  bets,
  marketSelections,
  markets,
  matches,
  parlays,
  players,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { BetsByMatch, type MatchGroupVM, type BetEntry } from "@/components/betting/BetsByMatch";
import { BetStatusBadge } from "@/components/betting/BetStatusBadge";

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

export default async function MyBetsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Pull single bets (not parlay children) and parlays in parallel.
  const singleBets = await db
    .select()
    .from(bets)
    .where(eq(bets.userId, session.user.id))
    .orderBy(desc(bets.placedAt))
    .limit(200);
  const userParlays = await db
    .select()
    .from(parlays)
    .where(eq(parlays.userId, session.user.id))
    .orderBy(desc(parlays.placedAt))
    .limit(100);

  const standaloneBets = singleBets.filter((b) => b.parlayId === null);

  if (standaloneBets.length === 0 && userParlays.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Moje sázky</h1>
        <Card>
          <CardHeader>
            <CardTitle>Žádné sázky</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Zatím jsi nevsadil. Otevři Turnaj a klikni na kurz vedle hráče
              — nebo si poskládej akumulátor v Bet builderu.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Collect every selection id we need across single bets + parlay children
  // so we can resolve labels in one shot.
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

  // --- Single bets grouped by match (existing behavior) ---
  type GroupKey = string;
  const grouped = new Map<GroupKey, MatchGroupVM>();

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

  // --- Parlays ---
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Moje sázky</h1>

      {parlayCards.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Akumulátory</h2>
          <div className="space-y-3">
            {parlayCards.map((p) => (
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
                      <span className="font-mono font-semibold text-amber-400">
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
                          <span className="font-mono text-amber-400">
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
        </section>
      )}

      {groupList.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Jednotlivé sázky</h2>
          <BetsByMatch groups={groupList} />
        </section>
      )}
    </div>
  );
  void isNull;
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
