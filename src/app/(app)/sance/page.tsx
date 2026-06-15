import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { players } from "@/db/schema";
import { tournamentService } from "@/lib/tournament";
import { simulateTournament, type SimConfig } from "@/lib/tournament-sim";
import type { TournamentConfig } from "@/lib/tournament-config";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OddsViz } from "@/components/admin/OddsViz";

export const metadata = {
  title: "Šance",
};

export default async function SancePage() {
  const t = await tournamentService.getActive();

  if (!t) {
    return (
      <div className="space-y-6">
        <PageHeader title="Šance — Monte Carlo simulace" />
        <Card>
          <CardHeader>
            <CardTitle>Žádný aktivní turnaj</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Až admin spustí turnaj, objeví se zde šance jednotlivých hráčů.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const ps = await db.select().from(players).where(eq(players.tournamentId, t.id));

  if (ps.length < 2) {
    return (
      <div className="space-y-6">
        <PageHeader title="Šance — Monte Carlo simulace" description={t.name} />
        <p className="text-sm text-muted-foreground">
          Pro simulaci jsou potřeba aspoň 2 hráči.
        </p>
      </div>
    );
  }

  const cfg = t.configJson as TournamentConfig;
  const simCfg: SimConfig = {
    groupCount: cfg.groupCount,
    groupSize: cfg.groupSize,
    advancePerGroup: cfg.advancePerGroup,
    bestOfGroup: cfg.bestOfGroup,
    bestOfQuarter: cfg.bestOfQuarter,
    bestOfSemi: cfg.bestOfSemi,
    bestOfFinal: cfg.bestOfFinal,
    thirdPlaceMatch: cfg.thirdPlaceMatch,
  };

  const sim = simulateTournament(
    ps.map((p) => ({ id: p.id, name: p.name, eloRating: p.eloRating })),
    simCfg,
    { runs: 10000 }
  );
  const names: Record<string, string> = {};
  for (const p of ps) names[p.id] = p.name;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Šance — Monte Carlo simulace"
        description={`${t.name} · ${sim.runs.toLocaleString("cs")} běhů`}
      />
      <p className="text-sm text-muted-foreground">
        Sílu hráčů z minulých turnajů přeneseme do{" "}
        {sim.runs.toLocaleString("cs")} simulací celého turnaje a spočítáme, jak
        často kdo kam dojde. Víc v{" "}
        <Link href="/info" className="underline hover:text-foreground">
          info
        </Link>
        .
      </p>
      <OddsViz sim={sim} names={names} houseEdge={cfg.houseEdge ?? 0} />
    </div>
  );
}
