import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { ProfileCard } from "@/components/user/ProfileCard";

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const [user] = await db
    .select({
      username: users.username,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      capital: users.capital,
      role: users.role,
    })
    .from(users)
    .where(eq(users.username, username));

  if (!user) notFound();

  return (
    <div className="max-w-2xl">
      <ProfileCard {...user} />
    </div>
  );
}
