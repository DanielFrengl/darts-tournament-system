"use client";

import { useState } from "react";
import { Layers, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BetBuilder, type BuilderGroupVM } from "./BetBuilder";
import { MarketCard, type MarketCardVM } from "./MarketCard";

export type SingleGroupVM = {
  key: string;
  label: string;
  sublabel: string | null;
  matchId: string | null;
  markets: MarketCardVM[];
};

type Mode = "single" | "builder";

export function SazeniSurface({
  singleGroups,
  builderGroups,
  capital,
  maxStakePct,
}: {
  singleGroups: SingleGroupVM[];
  builderGroups: BuilderGroupVM[];
  capital: number;
  maxStakePct: number;
}) {
  const [mode, setMode] = useState<Mode>("single");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {mode === "single"
            ? "Klikni na kurz pro jednoduchou sázku."
            : "Vyber 2+ výběry z různých zápasů a sklouzni je do akumulátoru."}
        </p>
        <div className="inline-flex rounded-md border bg-card shadow-sm">
          <Button
            type="button"
            variant={mode === "single" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMode("single")}
            className="rounded-r-none"
          >
            <Zap className="mr-1 h-4 w-4" />
            Jednoduchá
          </Button>
          <Button
            type="button"
            variant={mode === "builder" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMode("builder")}
            className="rounded-l-none"
          >
            <Layers className="mr-1 h-4 w-4" />
            Bet builder
          </Button>
        </div>
      </div>

      {mode === "single" ? (
        <SingleBetView
          groups={singleGroups}
          capital={capital}
          maxStakePct={maxStakePct}
        />
      ) : (
        <BetBuilder
          groups={builderGroups}
          capital={capital}
          maxStakePct={maxStakePct}
        />
      )}
    </div>
  );
}

function SingleBetView({
  groups,
  capital,
  maxStakePct,
}: {
  groups: SingleGroupVM[];
  capital: number;
  maxStakePct: number;
}) {
  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Žádné otevřené trhy.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <Card key={g.key}>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">{g.label}</CardTitle>
            {g.sublabel && (
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {g.sublabel}
              </p>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {g.markets.map((m) => (
                <MarketCard
                  key={m.id}
                  market={m}
                  matchId={g.matchId ?? ""}
                  capital={capital}
                  maxStakePct={maxStakePct}
                  canBet
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
