import { Coins } from "lucide-react";

export function CapitalDisplay({ capital }: { capital: string }) {
  const formatted = new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(capital));
  return (
    <div className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-secondary/60 px-3 text-sm">
      <Coins className="h-4 w-4 text-amber-400" aria-hidden />
      <span className="font-mono font-semibold tabular-nums">{formatted}</span>
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        Chips
      </span>
    </div>
  );
}
