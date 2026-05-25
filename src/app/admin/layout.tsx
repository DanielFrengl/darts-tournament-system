import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { Sidebar } from "@/components/layout/Sidebar";
import { UserMenu } from "@/components/layout/UserMenu";
import { CapitalDisplay } from "@/components/user/CapitalDisplay";
import { getAppSettings } from "@/lib/settings";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/");

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
  const settings = await getAppSettings();

  return (
    <div className="flex min-h-screen">
      <Sidebar role={me.role} systemName={settings.name} logoUrl={settings.logoUrl} />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-4 border-b p-4">
          <CapitalDisplay capital={me.capital} />
          <UserMenu username={me.username} avatarUrl={me.avatarUrl} />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
