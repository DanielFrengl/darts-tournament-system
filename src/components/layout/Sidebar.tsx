import Link from "next/link";
import type { ReactNode } from "react";
import { Home, Trophy, Receipt, Award } from "lucide-react";

export function Sidebar() {
  return (
    <aside className="w-56 space-y-2 border-r p-4">
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
