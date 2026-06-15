"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Home,
  Trophy,
  Receipt,
  Award,
  Shield,
  Settings,
  Users,
  FileText,
  Tv,
  Layers,
  Gauge,
  Dices,
  Link2,
} from "lucide-react";
import { isAdmin, type Role } from "@/lib/roles";
import { ReportBugButton } from "@/components/layout/ReportBugButton";

type NavItem = { href: string; label: string; icon: ReactNode };
type NavSection = { title?: string; items: NavItem[] };

const sections: NavSection[] = [
  {
    items: [{ href: "/", label: "Dashboard", icon: <Home className="h-4 w-4" /> }],
  },
  {
    title: "Turnaj",
    items: [
      { href: "/tournament", label: "Přehled", icon: <Trophy className="h-4 w-4" /> },
      { href: "/leaderboard", label: "Žebříček", icon: <Award className="h-4 w-4" /> },
      { href: "/elo", label: "Elo hráčů", icon: <Gauge className="h-4 w-4" /> },
      { href: "/sance", label: "Šance", icon: <Dices className="h-4 w-4" /> },
      { href: "/display", label: "TV Display", icon: <Tv className="h-4 w-4" /> },
    ],
  },
  {
    title: "Sázení",
    items: [
      { href: "/sazeni", label: "Sázení", icon: <Layers className="h-4 w-4" /> },
      { href: "/moje-sazky", label: "Moje sázky", icon: <Receipt className="h-4 w-4" /> },
    ],
  },
];

const adminItems: NavItem[] = [
  { href: "/admin", label: "Přehled", icon: <Shield className="h-4 w-4" /> },
  { href: "/admin/tournaments", label: "Turnaje", icon: <Trophy className="h-4 w-4" /> },
  { href: "/admin/users", label: "Uživatelé", icon: <Users className="h-4 w-4" /> },
  { href: "/admin/competitors", label: "Soutěžící (Elo)", icon: <Link2 className="h-4 w-4" /> },
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
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-4">
      <Link href="/" onClick={onNavigate} className="mb-4 flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt={systemName}
          className="h-9 w-9 rounded object-contain"
        />
        <span className="truncate text-base font-bold leading-tight">{systemName}</span>
      </Link>

      {sections.map((section, i) => (
        <div key={i} className="space-y-1">
          {section.title && (
            <p className="mt-3 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {section.title}
            </p>
          )}
          <nav className="space-y-1">
            {section.items.map((item) => (
              <SidebarLink key={item.href} {...item} onNavigate={onNavigate} />
            ))}
          </nav>
        </div>
      ))}

      {isAdmin(role) && (
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

      <div className="mt-auto pt-4">
        <ReportBugButton />
        <p className="px-2 pt-2 text-[10px] text-muted-foreground/60">
          Made by danielfrengl · v. 1.0.0
        </p>
      </div>
    </div>
  );
}

export function Sidebar(props: { role: Role; systemName: string; logoUrl: string }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 border-r bg-card md:flex md:flex-col">
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
  const pathname = usePathname();
  const active =
    href === "/" || href === "/admin"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
        active
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      )}
    >
      <span className={cn("shrink-0", active ? "text-foreground" : "text-muted-foreground")}>
        {icon}
      </span>
      {label}
    </Link>
  );
}
