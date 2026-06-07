import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { UserMenu } from "@/components/layout/UserMenu";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { UserLiveSync } from "@/components/layout/UserLiveSync";
import { CapitalDisplay } from "@/components/user/CapitalDisplay";

type Role = "user" | "admin";

export type AppShellUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  capital: string;
  role: Role;
};

/**
 * Shared application chrome (sidebar + sticky header + content area).
 * Used by both the player and admin layouts so the header never drifts
 * between the two.
 */
export function AppShell({
  user,
  systemName,
  logoUrl,
  children,
}: {
  user: AppShellUser;
  systemName: string;
  logoUrl: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <UserLiveSync userId={user.id} />
      <Sidebar role={user.role} systemName={systemName} logoUrl={logoUrl} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-card/95 p-3 backdrop-blur supports-backdrop-filter:bg-card/60 sm:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <MobileNav role={user.role} systemName={systemName} logoUrl={logoUrl} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt={systemName}
              className="h-7 w-7 rounded object-contain"
            />
            <span className="truncate text-sm font-semibold">{systemName}</span>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <CapitalDisplay capital={user.capital} />
            <ThemeToggle />
            <UserMenu
              username={user.username}
              displayName={user.displayName}
              avatarUrl={user.avatarUrl}
            />
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">
          <div className="mx-auto w-full max-w-screen-2xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
