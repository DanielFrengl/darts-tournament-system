import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { tournamentService } from "@/lib/tournament";
import { playerService } from "@/lib/player";
import { matchService } from "@/lib/match";
import { TournamentControls } from "@/components/admin/TournamentControls";
import { TournamentAdminActions } from "@/components/admin/TournamentAdminActions";
import { AdvancePerGroupFix } from "@/components/admin/AdvancePerGroupFix";
import { RoundLengthCard } from "@/components/admin/RoundLengthCard";
import { RatingResyncCard } from "@/components/admin/RatingResyncCard";
import { WizardNav } from "@/components/admin/WizardNav";
import { auth } from "@/lib/auth";
import { isDebug } from "@/lib/roles";

export default async function AdminTournamentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await tournamentService.get(id);
  if (!t) notFound();

  const session = await auth();
  const canDebug = isDebug(session?.user?.role);

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
  // Nobody has a rating edge over anybody: every pairing prices at 50/50 and
  // the whole board opens at kurz 2.00.
  const flatRatings =
    players.length > 1 &&
    players.every((p) => p.eloRating === players[0]!.eloRating);

  return (
    <div className="space-y-4">
      <WizardNav
        back={{ href: "/admin/tournaments", label: "Zpět na turnaje" }}
      />
      <PageHeader title={t.name}>
        <StatusBadge kind="tournament" status={t.status} />
      </PageHeader>

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
        canDebug={canDebug}
      />

      {(t.status === "draft" || t.status === "groups") && (
        <AdvancePerGroupFix
          tournamentId={id}
          groupCount={t.configJson.groupCount}
          currentAdvance={t.configJson.advancePerGroup}
          groupSize={t.configJson.groupSize}
        />
      )}

      {t.status !== "finished" && (
        <RatingResyncCard tournamentId={id} flatRatings={flatRatings} />
      )}

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
            <dt className="text-muted-foreground">3. místo</dt>
            <dd>{t.configJson.thirdPlaceMatch ? "ano" : "ne"}</dd>
            <dt className="text-muted-foreground">Startovní kapitál</dt>
            <dd>{t.configJson.startingCapital}</dd>
          </dl>
        </CardContent>
      </Card>

      {t.status !== "finished" ? (
        <RoundLengthCard
          tournamentId={id}
          bestOf={{
            group: t.configJson.bestOfGroup,
            quarter: t.configJson.bestOfQuarter,
            semi: t.configJson.bestOfSemi,
            final: t.configJson.bestOfFinal,
          }}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Počet legů</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Skupina</dt>
              <dd>best of {t.configJson.bestOfGroup}</dd>
              <dt className="text-muted-foreground">Čtvrtfinále</dt>
              <dd>best of {t.configJson.bestOfQuarter}</dd>
              <dt className="text-muted-foreground">Semifinále</dt>
              <dd>best of {t.configJson.bestOfSemi}</dd>
              <dt className="text-muted-foreground">Finále</dt>
              <dd>best of {t.configJson.bestOfFinal}</dd>
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
