import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
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
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b p-3 sm:p-4">
          <div className="flex items-center gap-2 md:hidden">
            <MobileNav
              role={me.role}
              systemName={settings.name}
              logoUrl={settings.logoUrl}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={settings.logoUrl}
              alt={settings.name}
              className="h-7 w-7 rounded object-contain"
            />
            <span className="truncate text-sm font-semibold">{settings.name}</span>
          </div>
          <div className="ml-auto flex items-center gap-3 sm:gap-4">
            <CapitalDisplay capital={me.capital} />
            <UserMenu username={me.username} avatarUrl={me.avatarUrl} />
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
