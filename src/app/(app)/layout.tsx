import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { UserMenu } from "@/components/layout/UserMenu";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { CapitalDisplay } from "@/components/user/CapitalDisplay";
import { displayName } from "@/lib/names";
import { getAppSettings } from "@/lib/settings";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const [me] = await db
    .select({
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarUrl: users.avatarUrl,
      capital: users.capital,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, session.user.id));
  if (!me) redirect("/login");
  const settings = await getAppSettings();

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar role={me.role} systemName={settings.name} logoUrl={settings.logoUrl} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-card/95 p-3 backdrop-blur supports-backdrop-filter:bg-card/60 sm:p-4">
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
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <CapitalDisplay capital={me.capital} />
            <ThemeToggle />
            <UserMenu
              username={me.username}
              displayName={displayName(me)}
              avatarUrl={me.avatarUrl}
            />
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
