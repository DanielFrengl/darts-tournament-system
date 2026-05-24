import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { tournamentService } from "@/lib/tournament";
import { playerService } from "@/lib/player";
import { matchService } from "@/lib/match";
import { TournamentControls } from "@/components/admin/TournamentControls";

export default async function AdminTournamentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await tournamentService.get(id);
  if (!t) notFound();

  const players = await playerService.list(id);
  const groups = await playerService.listGroups(id);
  const allMatches = await matchService.listByTournament(id);
  const groupMatches = allMatches.filter((m) => m.phase === "group");
  const playoffMatches = allMatches.filter((m) => m.phase !== "group");
  const finishedGroup = groupMatches.filter((m) => m.status === "finished").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t.name}</h1>
        <Badge variant="outline">{t.status}</Badge>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" render={<Link href={`/admin/tournaments/${id}/players`}>Hráči ({players.length})</Link>} />
        <Button variant="outline" render={<Link href={`/admin/tournaments/${id}/matches`}>Zápasy</Link>} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stav</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>Skupiny: {groups.length} (kapacita {t.configJson.groupSize} hráčů)</div>
          <div>Hráči: {players.length} / {t.configJson.groupCount * t.configJson.groupSize}</div>
          <div>Skupinové zápasy: {finishedGroup} / {groupMatches.length} dokončeno</div>
          <div>Playoff zápasy: {playoffMatches.length}</div>
          <TournamentControls tournamentId={id} status={t.status} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Konfigurace</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Skupin</dt>
            <dd>{t.configJson.groupCount}</dd>
            <dt className="text-muted-foreground">Postupuje ze skupiny</dt>
            <dd>{t.configJson.advancePerGroup}</dd>
            <dt className="text-muted-foreground">Skupina best of</dt>
            <dd>{t.configJson.bestOfGroup}</dd>
            <dt className="text-muted-foreground">Čtvrtfinále</dt>
            <dd>{t.configJson.bestOfQuarter}</dd>
            <dt className="text-muted-foreground">Semifinále</dt>
            <dd>{t.configJson.bestOfSemi}</dd>
            <dt className="text-muted-foreground">Finále</dt>
            <dd>{t.configJson.bestOfFinal}</dd>
            <dt className="text-muted-foreground">3. místo</dt>
            <dd>{t.configJson.thirdPlaceMatch ? "ano" : "ne"}</dd>
            <dt className="text-muted-foreground">Startovní kapitál</dt>
            <dd>{t.configJson.startingCapital}</dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
