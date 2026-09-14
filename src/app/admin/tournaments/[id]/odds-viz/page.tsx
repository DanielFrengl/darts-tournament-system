import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { players, tournaments } from "@/db/schema";
import { simulateTournament, type SimConfig } from "@/lib/tournament-sim";
import { loadGroupDraw } from "@/lib/sim-draw";
import type { TournamentConfig } from "@/lib/tournament-config";
import { PageHeader } from "@/components/layout/PageHeader";
import { OddsViz } from "@/components/admin/OddsViz";

export default async function OddsVizPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, id));
  if (!t) return <div className="p-6 text-slate-400">Turnaj nenalezen.</div>;

  const ps = await db.select().from(players).where(eq(players.tournamentId, id));
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

  if (ps.length < 2) {
    return (
      <div className="space-y-6">
        <PageHeader title="Kurzy — simulace" description={t.name} />
        <p className="text-slate-400">
          Pro simulaci jsou potřeba aspoň 2 hráči.
        </p>
      </div>
    );
  }

  // Simulate the tournament that is actually being played: once the groups
  // are drawn, keep them.
  const draw = await loadGroupDraw(db, id);
  const sim = simulateTournament(
    ps.map((p) => ({ id: p.id, name: p.name, eloRating: p.eloRating })),
    simCfg,
    { runs: 10000, draw }
  );
  const names: Record<string, string> = {};
  for (const p of ps) names[p.id] = p.name;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kurzy — Monte Carlo simulace"
        description={`${t.name} · ${sim.runs.toLocaleString("cs")} běhů`}
      />
      <OddsViz sim={sim} names={names} houseEdge={cfg.houseEdge ?? 0} />
    </div>
  );
}
