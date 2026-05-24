import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { tournamentService } from "@/lib/tournament";
import { buildGroupViews, buildBracketMatches } from "@/lib/tournament-views";
import { GroupTable } from "@/components/tournament/GroupTable";
import { BracketView } from "@/components/tournament/BracketView";
import { TournamentLiveSync } from "@/components/tournament/TournamentLiveSync";

export default async function TournamentOverviewPage() {
  const t = await tournamentService.getActive();
  if (!t) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Žádný aktivní turnaj</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Až admin spustí turnaj, objeví se zde.</p>
        </CardContent>
      </Card>
    );
  }

  const groupViews = await buildGroupViews(t.id, t.configJson);
  const bracketMatches = await buildBracketMatches(t.id);
  const showBracket = t.status === "playoff" || t.status === "finished";

  return (
    <div className="space-y-6">
      <TournamentLiveSync tournamentId={t.id} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t.name}</h1>
        <Badge variant="outline">{t.status}</Badge>
      </div>

      {groupViews.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Skupiny</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {groupViews.map((g) => (
              <GroupTable key={g.groupId} groupName={g.groupName} rows={g.rows} />
            ))}
          </CardContent>
        </Card>
      )}

      {showBracket && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Pavouk</CardTitle>
            <Button
              variant="outline"
              render={<Link href="/tournament/bracket">Plná velikost</Link>}
            />
          </CardHeader>
          <CardContent>
            <BracketView matches={bracketMatches} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
