import { Badge } from "@/components/ui/badge";
import { LiveDot } from "@/components/ui/live-dot";
import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "destructive" | "outline" | "ghost";

type StatusMeta = { label: string; variant: Variant; live?: boolean };

const TOURNAMENT: Record<string, StatusMeta> = {
  draft: { label: "Příprava", variant: "secondary" },
  groups: { label: "Skupiny", variant: "default" },
  playoff: { label: "Playoff", variant: "default" },
  finished: { label: "Dokončeno", variant: "outline" },
};

const MATCH: Record<string, StatusMeta> = {
  scheduled: { label: "Naplánováno", variant: "secondary" },
  live: { label: "Živě", variant: "default", live: true },
  finished: { label: "Hotovo", variant: "outline" },
  cancelled: { label: "Zrušeno", variant: "destructive" },
};

const MARKET: Record<string, StatusMeta> = {
  open: { label: "Otevřený", variant: "default" },
  closed: { label: "Uzavřený", variant: "secondary" },
  settled: { label: "Vyhodnoceno", variant: "outline" },
  cancelled: { label: "Zrušeno", variant: "destructive" },
};

const MAPS = { tournament: TOURNAMENT, match: MATCH, market: MARKET } as const;

/**
 * Localized, consistently-styled badge for the various enum statuses.
 * Keeps Czech labels and variant choices in one place instead of raw
 * lowercase English statuses scattered across pages.
 */
export function StatusBadge({
  kind,
  status,
  className,
}: {
  kind: keyof typeof MAPS;
  status: string;
  className?: string;
}) {
  const meta = MAPS[kind][status] ?? { label: status, variant: "secondary" as const };
  return (
    <Badge variant={meta.variant} className={cn(meta.live && "gap-1.5", className)}>
      {meta.live && <LiveDot size="sm" />}
      {meta.label}
    </Badge>
  );
}
