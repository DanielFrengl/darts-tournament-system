import { tournamentService } from "@/lib/tournament";
import { buildMatchList, buildBracketMatches } from "@/lib/tournament-views";
import { getAppSettings } from "@/lib/settings";
import { TvDisplay } from "@/components/tournament/TvDisplay";

export const dynamic = "force-dynamic";

export default async function DisplayPage() {
  const settings = await getAppSettings();
  const t = await tournamentService.getActive();
  if (!t) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={settings.logoUrl} alt={settings.name} className="h-40 w-40 object-contain" />
        <p className="text-3xl">{settings.name}</p>
        <p className="text-xl text-white/60">Žádný aktivní turnaj.</p>
      </div>
    );
  }
  const matches = await buildMatchList(t.id);
  const bracket = await buildBracketMatches(t.id);
  const initialFactIndex = Math.floor(Date.now() / 12_000);
  return (
    <TvDisplay
      tournamentId={t.id}
      tournamentName={t.name}
      systemName={settings.name}
      logoUrl={settings.logoUrl}
      startedAt={t.startedAt ? t.startedAt.toISOString() : null}
      matches={matches}
      bracket={bracket}
      initialFactIndex={initialFactIndex}
    />
  );
}
