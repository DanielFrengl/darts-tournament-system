import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { competitors, users } from "@/db/schema";
import { displayName } from "@/lib/names";
import { PageHeader } from "@/components/layout/PageHeader";
import { tournamentService } from "@/lib/tournament";
import { CompetitorLinker } from "@/components/admin/CompetitorLinker";

export default async function AdminCompetitorsPage() {
  const rows = await db
    .select({
      id: competitors.id,
      displayName: competitors.displayName,
      eloRating: competitors.eloRating,
      userId: competitors.userId,
      linkedUsername: users.username,
    })
    .from(competitors)
    .leftJoin(users, eq(competitors.userId, users.id))
    .orderBy(desc(competitors.eloRating));

  const allUsers = await db
    .select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .orderBy(asc(users.username));

  const userOptions = allUsers.map((u) => ({
    id: u.id,
    label: `${displayName(u)} (@${u.username})`,
  }));

  const active = await tournamentService.getActive();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Soutěžící"
        description="Přiřaď registrovaný účet k soutěžícímu a přepočítej kurzy z ratingů."
      />
      <CompetitorLinker
        competitors={rows}
        users={userOptions}
        activeTournamentId={active?.id ?? null}
      />
    </div>
  );
}
