import Link from "next/link";
import type { ReactNode } from "react";
import { Home, Trophy, Receipt, Award, Shield, Settings, Users, FileText, Tv, Layers } from "lucide-react";

type Role = "user" | "admin";

type NavItem = { href: string; label: string; icon: ReactNode };

const userItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: <Home className="h-4 w-4" /> },
  { href: "/tournament", label: "Turnaj", icon: <Trophy className="h-4 w-4" /> },
  { href: "/bet-builder", label: "Bet builder", icon: <Layers className="h-4 w-4" /> },
  { href: "/bets", label: "Moje sázky", icon: <Receipt className="h-4 w-4" /> },
  { href: "/leaderboard", label: "Žebříček", icon: <Award className="h-4 w-4" /> },
  { href: "/display", label: "TV Display", icon: <Tv className="h-4 w-4" /> },
];

const adminItems: NavItem[] = [
  { href: "/admin", label: "Přehled", icon: <Shield className="h-4 w-4" /> },
  { href: "/admin/tournaments", label: "Turnaje", icon: <Trophy className="h-4 w-4" /> },
  { href: "/admin/users", label: "Uživatelé", icon: <Users className="h-4 w-4" /> },
  { href: "/admin/audit", label: "Audit log", icon: <FileText className="h-4 w-4" /> },
  { href: "/admin/settings", label: "Nastavení", icon: <Settings className="h-4 w-4" /> },
];

export function SidebarNav({
  role,
  systemName,
  logoUrl,
  onNavigate,
}: {
  role: Role;
  systemName: string;
  logoUrl: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <Link href="/" onClick={onNavigate} className="mb-6 flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt={systemName}
          className="h-9 w-9 rounded object-contain"
        />
        <span className="truncate text-base font-bold leading-tight">{systemName}</span>
      </Link>
      <nav className="space-y-1">
        {userItems.map((item) => (
          <SidebarLink key={item.href} {...item} onNavigate={onNavigate} />
        ))}
      </nav>
      {role === "admin" && (
        <>
          <div className="my-2 border-t" />
          <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Admin
          </p>
          <nav className="space-y-1">
            {adminItems.map((item) => (
              <SidebarLink key={item.href} {...item} onNavigate={onNavigate} />
            ))}
          </nav>
        </>
      )}
    </div>
  );
}

export function Sidebar(props: { role: Role; systemName: string; logoUrl: string }) {
  return (
    <aside className="hidden w-56 shrink-0 border-r md:flex md:flex-col">
      <SidebarNav {...props} />
    </aside>
  );
}

function SidebarLink({
  href,
  icon,
  label,
  onNavigate,
}: NavItem & { onNavigate?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
    >
      {icon}
      {label}
    </Link>
  );
}
