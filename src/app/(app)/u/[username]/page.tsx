import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/db/client";
import { transactions, users } from "@/db/schema";
import { displayName } from "@/lib/names";
import { tournamentService } from "@/lib/tournament";
import { userStats } from "@/lib/user-stats";
import { ProfileCard } from "@/components/user/ProfileCard";
import { ProfileStats } from "@/components/user/ProfileStats";
import { CapitalChart, type CapitalPoint } from "@/components/user/CapitalChart";
import { TournamentLiveSync } from "@/components/tournament/TournamentLiveSync";

const MAX_CHART_POINTS = 100;

/** Running balance series, thinned to ~MAX_CHART_POINTS (first + last always kept). */
async function capitalSeries(userId: string): Promise<CapitalPoint[]> {
  const rows = await db
    .select({
      balanceAfter: transactions.balanceAfter,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(asc(transactions.createdAt));

  const points = rows.map((r) => ({
    t: r.createdAt.getTime(),
    balance: Number(r.balanceAfter),
  }));

  if (points.length <= MAX_CHART_POINTS) return points;
  const stride = Math.ceil(points.length / MAX_CHART_POINTS);
  const thinned = points.filter((_, i) => i % stride === 0);
  const last = points[points.length - 1]!;
  if (thinned[thinned.length - 1] !== last) thinned.push(last);
  return thinned;
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      capital: users.capital,
      role: users.role,
    })
    .from(users)
    .where(eq(users.username, username));

  if (!user) notFound();

  const active = await tournamentService.getActive();
  const allTime = await userStats(user.id);
  const current = active ? await userStats(user.id, active.id) : null;
  const series = await capitalSeries(user.id);
  const defaultTab = current ? "current" : "all";

  return (
    <div className="max-w-3xl space-y-4">
      {active && <TournamentLiveSync tournamentId={active.id} />}
      <ProfileCard {...user} displayName={displayName(user)} />
      <Card>
        <CardHeader>
          <CardTitle>Statistiky</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={defaultTab}>
            <TabsList>
              <TabsTrigger value="current" disabled={!current}>
                {active ? `Aktuální turnaj` : "Aktuální turnaj"}
              </TabsTrigger>
              <TabsTrigger value="all">Celkově</TabsTrigger>
            </TabsList>
            {current && (
              <TabsContent value="current" className="mt-4">
                <ProfileStats
                  stats={current}
                  title={`V turnaji ${active!.name}`}
                />
              </TabsContent>
            )}
            <TabsContent value="all" className="mt-4">
              <ProfileStats stats={allTime} title="Napříč všemi turnaji" />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Vývoj jablek</CardTitle>
        </CardHeader>
        <CardContent>
          <CapitalChart points={series} />
        </CardContent>
      </Card>
    </div>
  );
}
