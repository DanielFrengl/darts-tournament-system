import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { displayName } from "@/lib/names";
import { UserList } from "@/components/admin/UserList";

export default async function AdminUsersPage() {
  const session = await auth();
  const allUsers = await db
    .select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      role: users.role,
      capital: users.capital,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  const withDisplay = allUsers.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: displayName(u),
    email: u.email,
    role: u.role,
    capital: u.capital,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Uživatelé</h1>
      <UserList users={withDisplay} currentUserId={session!.user.id} />
    </div>
  );
}
