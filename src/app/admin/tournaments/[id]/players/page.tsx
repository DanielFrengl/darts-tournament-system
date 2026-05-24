import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { tournamentService } from "@/lib/tournament";
import { playerService } from "@/lib/player";
import { PlayerManager } from "@/components/admin/PlayerManager";
import { ensureGroupsForTournament } from "./actions";

export default async function PlayersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await tournamentService.get(id);
  if (!t) notFound();

  let groups = await playerService.listGroups(id);
  const editable = t.status === "draft";
  const players = await playerService.list(id);

  async function createGroupsAction() {
    "use server";
    await ensureGroupsForTournament(id, t!.configJson.groupCount);
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">{t.name} — Hráči</h1>
      <Card>
        <CardHeader>
          <CardTitle>Skupiny</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {groups.length === 0 ? (
            <form action={createGroupsAction}>
              <p className="mb-2 text-sm text-muted-foreground">
                Skupiny ještě nejsou vytvořeny. Klikni dole na vytvoření {t.configJson.groupCount}{" "}
                skupin.
              </p>
              <Button type="submit">Vytvořit skupiny A..{String.fromCharCode(64 + t.configJson.groupCount)}</Button>
            </form>
          ) : (
            <ul className="flex flex-wrap gap-2 text-sm">
              {groups.map((g) => (
                <li key={g.id} className="rounded border px-2 py-1 font-medium">
                  Skupina {g.name}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Hráči ({players.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <PlayerManager
            tournamentId={id}
            players={players.map((p) => ({ id: p.id, name: p.name, groupId: p.groupId }))}
            groups={groups.map((g) => ({ id: g.id, name: g.name }))}
            editable={editable}
          />
          {!editable && (
            <p className="mt-3 text-sm text-muted-foreground">
              Turnaj už není v draft fázi — úpravy hráčů jsou uzamčeny.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
