import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { UserList } from "@/components/admin/UserList";

export default async function AdminUsersPage() {
  const session = await auth();
  const allUsers = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      capital: users.capital,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Uživatelé</h1>
      <UserList users={allUsers} currentUserId={session!.user.id} />
    </div>
  );
}
