import Link from "next/link";
import type { ReactNode } from "react";
import { Home, Trophy, Receipt, Award, Shield } from "lucide-react";

export function Sidebar({ role }: { role: "user" | "admin" }) {
  return (
    <aside className="flex w-56 flex-col gap-2 border-r p-4">
      <Link href="/" className="mb-6 block text-xl font-bold">
        🎯 Darts
      </Link>
      <nav className="space-y-1">
        <SidebarLink href="/" icon={<Home className="h-4 w-4" />} label="Dashboard" />
        <SidebarLink href="/tournament" icon={<Trophy className="h-4 w-4" />} label="Turnaj" />
        <SidebarLink href="/bets" icon={<Receipt className="h-4 w-4" />} label="Moje sázky" />
        <SidebarLink
          href="/leaderboard"
          icon={<Award className="h-4 w-4" />}
          label="Žebříček"
        />
      </nav>
      {role === "admin" && (
        <>
          <div className="my-2 border-t" />
          <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Admin
          </p>
          <nav className="space-y-1">
            <SidebarLink
              href="/admin"
              icon={<Shield className="h-4 w-4" />}
              label="Přehled"
            />
            <SidebarLink
              href="/admin/tournaments"
              icon={<Trophy className="h-4 w-4" />}
              label="Turnaje"
            />
            <SidebarLink
              href="/admin/users"
              icon={<Home className="h-4 w-4" />}
              label="Uživatelé"
            />
            <SidebarLink
              href="/admin/audit"
              icon={<Receipt className="h-4 w-4" />}
              label="Audit log"
            />
          </nav>
        </>
      )}
    </aside>
  );
}

function SidebarLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
    >
      {icon}
      {label}
    </Link>
  );
}
