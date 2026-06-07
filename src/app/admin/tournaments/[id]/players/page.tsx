import { notFound } from "next/navigation";
import { asc, eq, inArray, notInArray } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { db } from "@/db/client";
import { players, users } from "@/db/schema";
import { tournamentService } from "@/lib/tournament";
import { playerService } from "@/lib/player";
import { PlayerManager } from "@/components/admin/PlayerManager";
import { WizardNav } from "@/components/admin/WizardNav";
import { PageHeader } from "@/components/layout/PageHeader";
import { displayName } from "@/lib/names";
import { ensureGroupsForTournament } from "./actions";

export default async function PlayersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await tournamentService.get(id);
  if (!t) notFound();

  const groups = await playerService.listGroups(id);
  const editable = t.status === "draft";
  const playerRows = await playerService.list(id);

  const alreadyLinked = playerRows
    .map((p) => p.userId)
    .filter((x): x is string => !!x);
  const availableUserRows =
    alreadyLinked.length > 0
      ? await db
          .select({
            id: users.id,
            username: users.username,
            firstName: users.firstName,
            lastName: users.lastName,
            avatarUrl: users.avatarUrl,
          })
          .from(users)
          .where(notInArray(users.id, alreadyLinked))
          .orderBy(asc(users.username))
      : await db
          .select({
            id: users.id,
            username: users.username,
            firstName: users.firstName,
            lastName: users.lastName,
            avatarUrl: users.avatarUrl,
          })
          .from(users)
          .orderBy(asc(users.username));
  void inArray;
  const availableUsers = availableUserRows.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: displayName(u),
    avatarUrl: u.avatarUrl,
  }));

  async function createGroupsAction() {
    "use server";
    await ensureGroupsForTournament(id, t!.configJson.groupCount);
  }

  return (
    <div className="max-w-3xl space-y-4">
      <WizardNav
        back={{ href: "/admin/tournaments", label: "Zpět na turnaje" }}
        next={{ href: `/admin/tournaments/${id}`, label: "Pokračovat na přehled" }}
      />
      <PageHeader
        title={`${t.name} — Hráči`}
        description={
          <>
            Krok 2 ze 3: 1. Konfigurace ·{" "}
            <span className="font-semibold text-foreground">Hráči</span> · 3.
            Spustit
          </>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Skupiny</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {groups.length === 0 ? (
            <form action={createGroupsAction}>
              <p className="mb-2 text-sm text-muted-foreground">
                Skupiny ještě nejsou vytvořeny. Klikni dole na vytvoření{" "}
                {t.configJson.groupCount} skupin.
              </p>
              <Button type="submit">
                Vytvořit skupiny A..{String.fromCharCode(64 + t.configJson.groupCount)}
              </Button>
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
          <CardTitle>Hráči ({playerRows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <PlayerManager
            tournamentId={id}
            players={playerRows.map((p) => ({
              id: p.id,
              name: p.name,
              groupId: p.groupId,
              userId: p.userId,
              avatarUrl: p.avatarUrl,
            }))}
            groups={groups.map((g) => ({ id: g.id, name: g.name }))}
            availableUsers={availableUsers}
            editable={editable}
          />
          {!editable && (
            <p className="mt-3 text-sm text-muted-foreground">
              Turnaj už není v draft fázi — úpravy hráčů jsou uzamčeny.
            </p>
          )}
        </CardContent>
      </Card>
      <WizardNav
        back={{ href: "/admin/tournaments", label: "Zpět" }}
        next={{ href: `/admin/tournaments/${id}`, label: "Pokračovat na přehled" }}
      />
    </div>
  );
}
