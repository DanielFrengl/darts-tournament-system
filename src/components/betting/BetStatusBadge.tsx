import { Badge } from "@/components/ui/badge";

export type BetStatus = "open" | "won" | "lost" | "refunded";

const LABEL: Record<BetStatus, string> = {
  open: "Open",
  won: "Won",
  lost: "Lost",
  refunded: "Refunded",
};

export function BetStatusBadge({ status }: { status: BetStatus }) {
  if (status === "won") {
    return (
      <Badge className="border-transparent bg-emerald-500/20 text-emerald-400 dark:bg-emerald-500/25 dark:text-emerald-300">
        {LABEL.won}
      </Badge>
    );
  }
  if (status === "lost") {
    return <Badge variant="destructive">{LABEL.lost}</Badge>;
  }
  if (status === "refunded") {
    return <Badge variant="outline">{LABEL.refunded}</Badge>;
  }
  return <Badge variant="secondary">{LABEL.open}</Badge>;
}
