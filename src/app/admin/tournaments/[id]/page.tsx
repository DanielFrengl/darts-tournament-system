import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { tournamentService } from "@/lib/tournament";
import { playerService } from "@/lib/player";
import { matchService } from "@/lib/match";
import { TournamentControls } from "@/components/admin/TournamentControls";
import { TournamentAdminActions } from "@/components/admin/TournamentAdminActions";
import { WizardNav } from "@/components/admin/WizardNav";

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
  const groupsDone =
    groupMatches.length > 0 &&
    groupMatches.every((m) => m.status === "finished" || m.status === "cancelled");
  const needsBracketFallback =
    t.status === "groups" && groupsDone && playoffMatches.length === 0;

  return (
    <div className="space-y-4">
      <WizardNav
        back={{ href: "/admin/tournaments", label: "Zpět na turnaje" }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t.name}</h1>
        <Badge variant="outline">{t.status}</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {t.status !== "draft" && t.status !== "finished" && (
          <Button
            render={<Link href={`/admin/tournaments/${id}/play`}>▶ Skórovat</Link>}
          />
        )}
        <Button variant="outline" render={<Link href={`/admin/tournaments/${id}/players`}>Hráči ({players.length})</Link>} />
        <Button variant="outline" render={<Link href={`/admin/tournaments/${id}/matches`}>Všechny zápasy</Link>} />
      </div>

      <TournamentAdminActions
        tournamentId={id}
        currentName={t.name}
        status={t.status}
      />

      <Card>
        <CardHeader>
          <CardTitle>Stav</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>Skupiny: {groups.length} (kapacita {t.configJson.groupSize} hráčů)</div>
          <div>Hráči: {players.length} / {t.configJson.groupCount * t.configJson.groupSize}</div>
          <div>Skupinové zápasy: {finishedGroup} / {groupMatches.length} dokončeno</div>
          <div>Playoff zápasy: {playoffMatches.length}</div>
          <TournamentControls
            tournamentId={id}
            status={t.status}
            needsBracketFallback={needsBracketFallback}
          />
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
