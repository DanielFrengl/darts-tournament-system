import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AvatarUpload } from "@/components/user/AvatarUpload";
import { BioForm, PasswordForm } from "./forms";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const [me] = await db
    .select({ username: users.username, avatarUrl: users.avatarUrl, bio: users.bio })
    .from(users)
    .where(eq(users.id, session.user.id));
  if (!me) redirect("/login");

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Nastavení</h1>
      <Card>
        <CardHeader>
          <CardTitle>Profilovka</CardTitle>
        </CardHeader>
        <CardContent>
          <AvatarUpload username={me.username} currentUrl={me.avatarUrl} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Bio</CardTitle>
        </CardHeader>
        <CardContent>
          <BioForm initialBio={me.bio ?? ""} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Změna hesla</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
