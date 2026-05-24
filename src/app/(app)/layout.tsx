import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { Sidebar } from "@/components/layout/Sidebar";
import { UserMenu } from "@/components/layout/UserMenu";
import { CapitalDisplay } from "@/components/user/CapitalDisplay";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const [me] = await db
    .select({
      username: users.username,
      avatarUrl: users.avatarUrl,
      capital: users.capital,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, session.user.id));
  if (!me) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-4 border-b p-4">
          <CapitalDisplay capital={me.capital} />
          <UserMenu username={me.username} avatarUrl={me.avatarUrl} role={me.role} />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
