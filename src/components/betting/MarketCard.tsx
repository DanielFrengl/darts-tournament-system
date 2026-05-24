"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BetDialog, type BetTarget } from "./BetDialog";

export type SelectionVM = {
  id: string;
  label: string;
  finalOdds: number;
  isWinner: boolean | null;
};

export type MarketCardVM = {
  id: string;
  title: string;
  status: "open" | "closed" | "settled" | "cancelled";
  selections: SelectionVM[];
};

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
            {market.selections.map((sel) => (
              <Button
                key={sel.id}
                variant={sel.isWinner ? "default" : "outline"}
                disabled={!canBet || market.status !== "open"}
                onClick={() =>
                  setTarget({
                    selectionId: sel.id,
                    marketLabel: market.title,
                    selectionLabel: sel.label,
                    finalOdds: sel.finalOdds,
                  })
                }
                className="flex items-center justify-between"
              >
                <span>{sel.label}</span>
                <span className="font-mono">{sel.finalOdds.toFixed(2)}</span>
              </Button>
            ))}
          </div>
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
