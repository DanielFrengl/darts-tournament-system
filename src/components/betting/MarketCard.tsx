"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatJablka } from "@/lib/jablka";
import { BetDialog, type BetTarget } from "./BetDialog";

export type SelectionVM = {
  id: string;
  label: string;
  finalOdds: number;
  isWinner: boolean | null;
  pool: number;
};

export type MarketCardVM = {
  id: string;
  title: string;
  status: "open" | "closed" | "settled" | "cancelled";
  selections: SelectionVM[];
  totalPool: number;
  /** ISO deadline for a leg market; null when nothing is counting down. */
  closesAt: string | null;
};

/**
 * Seconds left on a betting window, ticking locally.
 *
 * The server is the authority — it refuses a late bet whatever this shows —
 * so this only has to be honest enough that nobody is surprised.
 *
 * Via an external store rather than state in an effect: the snapshot is the
 * whole second remaining, so it stays identical between reads inside the same
 * second, and the server snapshot is null, so nothing is rendered server-side
 * for hydration to disagree with.
 */
function useSecondsLeft(closesAt: string | null): number | null {
  const deadline = closesAt === null ? null : Date.parse(closesAt);

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (deadline === null) return () => {};
      // Twice a second, so the figure shown is never a full second stale.
      const id = setInterval(onChange, 500);
      return () => clearInterval(id);
    },
    [deadline]
  );

  const getSnapshot = useCallback(
    () =>
      deadline === null
        ? null
        : Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
    [deadline]
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

const poolFmt = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 });

export function MarketCard({
  market,
  matchId,
  capital,
  maxBet,
  canBet,
}: {
  market: MarketCardVM;
  matchId: string;
  capital: number;
  maxBet: number | null;
  canBet: boolean;
}) {
  const [target, setTarget] = useState<BetTarget | null>(null);
  const secondsLeft = useSecondsLeft(market.closesAt);
  // The window having run out shuts the card even though the row still says
  // open — the server stopped taking bets at the same instant.
  const windowClosed = secondsLeft !== null && secondsLeft <= 0;
  const bettable = market.status === "open" && !windowClosed;
  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{market.title}</CardTitle>
          <div className="flex items-center gap-2">
            {bettable && secondsLeft !== null && (
              <span
                className={`font-mono text-xs tabular-nums ${
                  secondsLeft <= 10
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
                aria-live="polite"
              >
                zavírá se za {secondsLeft}s
              </span>
            )}
            {windowClosed && market.status === "open" ? (
              <StatusBadge kind="market" status="closed" />
            ) : (
              <StatusBadge kind="market" status={market.status} />
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {market.selections.map((sel) => {
              const sharePct =
                market.totalPool > 0 ? (sel.pool / market.totalPool) * 100 : 0;
              const disabled = !canBet || !bettable;
              const winningStyle =
                sel.isWinner === true
                  ? "border-emerald-500 bg-emerald-500/10"
                  : sel.isWinner === false
                    ? "opacity-60"
                    : "";
              return (
                <button
                  type="button"
                  key={sel.id}
                  disabled={disabled}
                  onClick={() =>
                    setTarget({
                      selectionId: sel.id,
                      marketLabel: market.title,
                      selectionLabel: sel.label,
                      finalOdds: sel.finalOdds,
                    })
                  }
                  className={`group relative cursor-pointer overflow-hidden rounded-md border border-border bg-card-elevated p-3 text-left shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:bg-accent hover:shadow-[var(--shadow-card-hover)] active:translate-y-0 disabled:cursor-not-allowed disabled:bg-muted/40 disabled:opacity-60 disabled:shadow-none disabled:hover:translate-y-0 disabled:hover:border-border disabled:hover:bg-muted/40 ${winningStyle}`}
                >
                  {market.totalPool > 0 && (
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 bg-foreground/[0.06]"
                      style={{ width: `${sharePct}%` }}
                    />
                  )}
                  <span className="relative flex items-center justify-between gap-3">
                    <span className="font-medium">{sel.label}</span>
                    <span className="flex items-center gap-3 text-sm">
                      {sel.pool > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {poolFmt.format(sel.pool)} · {sharePct.toFixed(0)}%
                        </span>
                      )}
                      <span className="font-mono text-lg font-bold tabular-nums text-foreground">
                        {sel.finalOdds.toFixed(2)}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {market.totalPool > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Pool celkem:{" "}
              <span className="font-mono text-foreground">
                {formatJablka(market.totalPool)}
              </span>
            </p>
          )}
        </CardContent>
      </Card>
      <BetDialog
        matchId={matchId}
        target={target}
        capital={capital}
        maxBet={maxBet}
        onClose={() => setTarget(null)}
      />
    </>
  );
}
