"use client";

import { useState } from "react";
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
};

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
  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{market.title}</CardTitle>
          <StatusBadge kind="market" status={market.status} />
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {market.selections.map((sel) => {
              const sharePct =
                market.totalPool > 0 ? (sel.pool / market.totalPool) * 100 : 0;
              const disabled = !canBet || market.status !== "open";
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
