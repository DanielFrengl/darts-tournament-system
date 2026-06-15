"use client";

import { useState } from "react";
import { Layers, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OddsHint } from "@/components/betting/OddsHint";
import { BetBuilder, type BuilderGroupVM } from "./BetBuilder";
import { MarketCard, type MarketCardVM } from "./MarketCard";

export type SingleGroupVM = {
  key: string;
  label: string;
  sublabel: string | null;
  isUpcoming?: boolean;
  isLive?: boolean;
  matchId: string | null;
  markets: MarketCardVM[];
};

type Mode = "single" | "builder";

export function SazeniSurface({
  singleGroups,
  builderGroups,
  capital,
  maxBet,
}: {
  singleGroups: SingleGroupVM[];
  builderGroups: BuilderGroupVM[];
  capital: number;
  maxBet: number | null;
}) {
  const [mode, setMode] = useState<Mode>("single");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {mode === "single"
            ? "Klikni na hráče, kterého tipuješ, a vsaď."
            : "Vyber 2+ tipy z různých zápasů a zkombinuj je do jedné sázky s vyšší výhrou."}
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
            Jedna sázka
          </Button>
          <Button
            type="button"
            variant={mode === "builder" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMode("builder")}
            className="rounded-l-none"
          >
            <Layers className="mr-1 h-4 w-4" />
            Akumulátor
          </Button>
        </div>
      </div>

      <OddsHint />

      {mode === "single" ? (
        <SingleBetView
          groups={singleGroups}
          capital={capital}
          maxBet={maxBet}
        />
      ) : (
        <BetBuilder
          groups={builderGroups}
          capital={capital}
          maxBet={maxBet}
        />
      )}
    </div>
  );
}

function SingleBetView({
  groups,
  capital,
  maxBet,
}: {
  groups: SingleGroupVM[];
  capital: number;
  maxBet: number | null;
}) {
  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Právě teď není na co sázet. Jakmile začne zápas, objeví se tu kurzy.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <section key={g.key} className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b pb-2">
            {g.isLive && (
              <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                Probíhající
              </span>
            )}
            {g.isUpcoming && !g.isLive && (
              <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
                Nadcházející
              </span>
            )}
            <h2 className="text-base font-semibold">{g.label}</h2>
            {g.sublabel && (
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {g.sublabel}
              </span>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {g.markets.map((m) => (
              <MarketCard
                key={m.id}
                market={m}
                matchId={g.matchId ?? ""}
                capital={capital}
                maxBet={maxBet}
                canBet
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
