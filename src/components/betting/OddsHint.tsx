import { Info } from "lucide-react";

/**
 * One-line explainer for what the odds number means, with a concrete
 * example. Shown on betting surfaces so a first-time user understands the
 * "2.00" next to a player without needing prior betting knowledge.
 */
export function OddsHint({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground ${className}`}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p>
        Číslo u hráče je <span className="font-semibold text-foreground">kurz</span>.
        Tvoje možná výhra = vklad × kurz. Třeba{" "}
        <span className="font-mono text-foreground">100</span> jablek na kurz{" "}
        <span className="font-mono text-foreground">2.00</span> vrátí při výhře{" "}
        <span className="font-mono text-foreground">200</span> jablek.
      </p>
    </div>
  );
}
