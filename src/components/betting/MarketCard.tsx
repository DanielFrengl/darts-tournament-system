"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  maxStakePct,
  canBet,
}: {
  market: MarketCardVM;
  matchId: string;
  capital: number;
  maxStakePct: number;
  canBet: boolean;
}) {
  const [target, setTarget] = useState<BetTarget | null>(null);
  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{market.title}</CardTitle>
          <Badge variant={market.status === "open" ? "default" : "secondary"}>
            {market.status}
          </Badge>
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
                  className={`group relative cursor-pointer overflow-hidden rounded-md border-2 border-amber-500/40 bg-amber-500/5 p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-amber-400 hover:bg-amber-500/15 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted/40 disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:border-border disabled:hover:bg-muted/40 disabled:hover:shadow-sm ${winningStyle}`}
                >
                  {market.totalPool > 0 && (
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 bg-amber-500/10"
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
                      <span className="font-mono text-lg font-bold tabular-nums text-amber-400 group-hover:text-amber-300">
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
                {poolFmt.format(market.totalPool)}
              </span>
            </p>
          )}
        </CardContent>
      </Card>
      <BetDialog
        matchId={matchId}
        target={target}
        capital={capital}
        maxStakePct={maxStakePct}
        onClose={() => setTarget(null)}
      />
    </>
  );
}
