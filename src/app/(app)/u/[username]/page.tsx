import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { displayName } from "@/lib/names";
import { tournamentService } from "@/lib/tournament";
import { userStats } from "@/lib/user-stats";
import { ProfileCard } from "@/components/user/ProfileCard";
import { ProfileStats } from "@/components/user/ProfileStats";

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
  const defaultTab = current ? "current" : "all";

  return (
    <div className="max-w-3xl space-y-4">
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
    </div>
  );
}
