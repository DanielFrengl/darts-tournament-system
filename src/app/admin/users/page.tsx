import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { displayName } from "@/lib/names";
import { UserList } from "@/components/admin/UserList";
import { PageHeader } from "@/components/layout/PageHeader";
import { isDebug } from "@/lib/roles";

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

  const canDebug = isDebug(session!.user.role);

  return (
    <div className="space-y-6">
      <PageHeader title="Uživatelé" description="Správa hráčů, rolí a kapitálu." />
      <UserList
        users={withDisplay}
        currentUserId={session!.user.id}
        canDebug={canDebug}
      />
    </div>
  );
}
