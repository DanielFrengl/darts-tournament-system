import { Apple } from "lucide-react";
import { jablkaWord } from "@/lib/jablka";

export function CapitalDisplay({ capital }: { capital: string }) {
  const value = Number(capital);
  const formatted = new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
  return (
    <div className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-secondary/60 px-3 text-sm">
      <Apple className="h-4 w-4 text-muted-foreground" aria-hidden />
      <span className="font-mono font-semibold tabular-nums">{formatted}</span>
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        {jablkaWord(value)}
      </span>
    </div>
  );
}
