import { notFound, redirect } from "next/navigation";
import { asc, eq, inArray, and, sum } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db/client";
import {
  bets,
  legs,
  matches,
  marketSelections,
  markets as marketsTable,
  players,
  users,
  tournaments,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import type { TournamentConfig } from "@/lib/tournament-config";
import {
  MarketCard,
  type MarketCardVM,
} from "@/components/betting/MarketCard";
import { MatchLiveSync } from "@/components/betting/MatchLiveSync";

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const [match] = await db.select().from(matches).where(eq(matches.id, id));
  if (!match) notFound();

  const playerIds = [match.playerAId, match.playerBId].filter((x): x is string => !!x);
  const playerRows = playerIds.length
    ? await db.select().from(players).where(inArray(players.id, playerIds))
    : [];
  const playerById = new Map(playerRows.map((p) => [p.id, p]));

  const [t] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, match.tournamentId));
  if (!t) notFound();
  const cfg = t.configJson as TournamentConfig;

  const [me] = await db
    .select({ capital: users.capital })
    .from(users)
    .where(eq(users.id, session.user.id));

  const allMarkets = await db
    .select()
    .from(marketsTable)
    .where(eq(marketsTable.matchId, id))
    .orderBy(asc(marketsTable.scope), asc(marketsTable.opensAt));
  const marketIds = allMarkets.map((m) => m.id);
  const allSelections = marketIds.length
    ? await db
        .select()
        .from(marketSelections)
        .where(inArray(marketSelections.marketId, marketIds))
    : [];
  const legRows = await db.select().from(legs).where(eq(legs.matchId, id)).orderBy(asc(legs.legNumber));
  const legNumberById = new Map(legRows.map((l) => [l.id, l.legNumber]));

  // Aggregated open-bet stake per selection
  const allSelectionIds = allSelections.map((s) => s.id);
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

  type CategoryKey = "primary" | "secondary" | "live";
  const vms: (MarketCardVM & { category: CategoryKey; sortKey: number })[] =
    allMarkets.map((m) => {
      const sels = allSelections
        .filter((s) => s.marketId === m.id)
        .map((s) => ({
          id: s.id,
          label: s.label,
          finalOdds: Number(s.finalOdds),
          isWinner: s.isWinner ?? null,
          pool: poolPerSelection.get(s.id) ?? 0,
        }));
      const totalPool = sels.reduce((acc, s) => acc + s.pool, 0);
      const legNumber = m.legId ? legNumberById.get(m.legId) ?? 0 : 0;
      const title =
        m.type === "match_winner"
          ? "Vítěz zápasu"
          : m.type === "correct_score"
            ? "Přesný výsledek"
            : m.legId
              ? `Leg ${legNumber || "?"} — vítěz`
              : "Leg";
      const category: CategoryKey =
        m.type === "match_winner"
          ? "primary"
          : m.type === "correct_score"
            ? "secondary"
            : "live";
      return {
        id: m.id,
        title,
        status: m.status,
        selections: sels,
        totalPool,
        category,
        sortKey: legNumber,
      };
    });

  const primary = vms.filter((v) => v.category === "primary");
  const secondary = vms.filter((v) => v.category === "secondary");
  const live = vms
    .filter((v) => v.category === "live")
    .sort((a, b) => a.sortKey - b.sortKey);

  const nameA = match.playerAId ? playerById.get(match.playerAId)?.name ?? "?" : "?";
  const nameB = match.playerBId ? playerById.get(match.playerBId)?.name ?? "?" : "?";
  const phaseLabel = labelPhase(match.phase);

  return (
    <div className="space-y-6">
      <MatchLiveSync matchId={id} marketIds={allMarkets.map((m) => m.id)} />
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{phaseLabel}</Badge>
          <Badge variant={match.status === "live" ? "default" : "secondary"}>{match.status}</Badge>
          <span className="text-sm text-muted-foreground">best of {match.bestOf}</span>
        </div>
        <h1 className="text-2xl font-semibold">
          {nameA} <span className="font-mono">{match.scoreA} : {match.scoreB}</span> {nameB}
        </h1>
      </div>

      {vms.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Žádné trhy</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Trhy pro tento zápas zatím nejsou otevřené.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {primary.length > 0 && (
            <Section title="Hlavní trh" subtitle="Kdo vyhraje zápas">
              <div className="grid gap-4 md:grid-cols-2">
                {primary.map((vm) => (
                  <MarketCard
                    key={vm.id}
                    market={vm}
                    matchId={id}
                    capital={Number(me?.capital ?? 0)}
                    maxStakePct={cfg.maxStakePct}
                    canBet={match.status !== "cancelled"}
                  />
                ))}
              </div>
            </Section>
          )}
          {secondary.length > 0 && (
            <Section title="Vedlejší trhy" subtitle="Přesný výsledek">
              <div className="grid gap-4 md:grid-cols-2">
                {secondary.map((vm) => (
                  <MarketCard
                    key={vm.id}
                    market={vm}
                    matchId={id}
                    capital={Number(me?.capital ?? 0)}
                    maxStakePct={cfg.maxStakePct}
                    canBet={match.status !== "cancelled"}
                  />
                ))}
              </div>
            </Section>
          )}
          {live.length > 0 && (
            <Section
              title="Live: jednotlivé legy"
              subtitle="Sázej na vítěze každého rozjetého legu"
            >
              <div className="grid gap-4 md:grid-cols-2">
                {live.map((vm) => (
                  <MarketCard
                    key={vm.id}
                    market={vm}
                    matchId={id}
                    capital={Number(me?.capital ?? 0)}
                    maxStakePct={cfg.maxStakePct}
                    canBet={match.status !== "cancelled"}
                  />
                ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && (
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function labelPhase(phase: string): string {
  switch (phase) {
    case "group":
      return "Skupina";
    case "quarter":
      return "Čtvrtfinále";
    case "semi":
      return "Semifinále";
    case "third_place":
      return "O 3. místo";
    case "final":
      return "Finále";
    default:
      return phase;
  }
}
