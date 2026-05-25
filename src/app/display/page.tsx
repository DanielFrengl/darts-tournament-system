import { tournamentService } from "@/lib/tournament";
import { buildMatchList } from "@/lib/tournament-views";
import { TvDisplay } from "@/components/tournament/TvDisplay";

export const dynamic = "force-dynamic";

export default async function DisplayPage() {
  const t = await tournamentService.getActive();
  if (!t) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-2xl text-white/60">Žádný aktivní turnaj.</p>
      </div>
    );
  }
  const matches = await buildMatchList(t.id);
  // Fact index seeded by minute so all clients see the same fact at
  // any given moment, but it rotates between server refreshes too.
  const initialFactIndex = Math.floor(Date.now() / 12_000);
  return (
    <TvDisplay
      tournamentId={t.id}
      tournamentName={t.name}
      startedAt={t.startedAt ? t.startedAt.toISOString() : null}
      matches={matches}
      initialFactIndex={initialFactIndex}
    />
  );
}
