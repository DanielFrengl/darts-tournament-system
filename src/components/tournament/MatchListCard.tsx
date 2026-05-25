"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import { BetDialog, type BetTarget } from "@/components/betting/BetDialog";

export type MatchListItem = {
  id: string;
  number: number | null;
  phaseLabel: string;
  status: "scheduled" | "live" | "finished" | "cancelled";
  bestOf: number;
  playerA: string;
  playerB: string;
  scoreA: number;
  scoreB: number;
  winnerSide: "A" | "B" | null;
  oddsA: number | null;
  oddsB: number | null;
  selectionIdA: string | null;
  selectionIdB: string | null;
};

export function MatchListCard({
  match,
  capital,
  maxStakePct,
  canBet,
}: {
  match: MatchListItem;
  capital: number;
  maxStakePct: number;
  canBet: boolean;
}) {
  const [target, setTarget] = useState<BetTarget | null>(null);
  const live = match.status === "live";
  const finished = match.status === "finished";
  const cancelled = match.status === "cancelled";
  const oddsAvailable =
    match.oddsA != null &&
    match.oddsB != null &&
    match.selectionIdA &&
    match.selectionIdB &&
    !finished &&
    !cancelled;

  return (
    <>
      <div className="group rounded-lg border bg-card p-4 transition-colors hover:border-foreground/30">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {match.number != null && (
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                #{match.number}
              </span>
            )}
            <Badge variant="outline" className="text-xs">
              {match.phaseLabel}
            </Badge>
            {live && (
              <Badge variant="default" className="animate-pulse text-xs">
                LIVE
              </Badge>
            )}
            {finished && (
              <Badge variant="secondary" className="text-xs">
                Hotovo
              </Badge>
            )}
            {cancelled && (
              <Badge variant="destructive" className="text-xs">
                Zrušeno
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">bo{match.bestOf}</span>
        </div>

        <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <PlayerSlot
            name={match.playerA}
            winner={match.winnerSide === "A"}
            align="right"
          />
          <span className="font-mono text-2xl font-bold tabular-nums">
            {match.scoreA} <span className="text-muted-foreground">:</span>{" "}
            {match.scoreB}
          </span>
          <PlayerSlot
            name={match.playerB}
            winner={match.winnerSide === "B"}
            align="left"
          />
        </div>

        {oddsAvailable ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <OddsButton
                name={match.playerA}
                odds={match.oddsA!}
                disabled={!canBet}
                onClick={() =>
                  setTarget({
                    selectionId: match.selectionIdA!,
                    marketLabel: "Vítěz zápasu",
                    selectionLabel: match.playerA,
                    finalOdds: match.oddsA!,
                  })
                }
              />
              <OddsButton
                name={match.playerB}
                odds={match.oddsB!}
                disabled={!canBet}
                onClick={() =>
                  setTarget({
                    selectionId: match.selectionIdB!,
                    marketLabel: "Vítěz zápasu",
                    selectionLabel: match.playerB,
                    finalOdds: match.oddsB!,
                  })
                }
              />
            </div>
            <Link
              href={`/match/${match.id}`}
              className="flex items-center justify-end gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Více trhů (přesný výsledek, legy)
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <Link
            href={`/match/${match.id}`}
            className="flex items-center justify-end gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Detail
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      <BetDialog
        matchId={match.id}
        target={target}
        capital={capital}
        maxStakePct={maxStakePct}
        onClose={() => setTarget(null)}
      />
    </>
  );
}

function PlayerSlot({
  name,
  winner,
  align,
}: {
  name: string;
  winner: boolean;
  align: "left" | "right";
}) {
  return (
    <span
      className={`truncate text-sm ${align === "right" ? "text-right" : "text-left"} ${winner ? "font-semibold" : ""}`}
    >
      {name}
    </span>
  );
}

function OddsButton({
  name,
  odds,
  onClick,
  disabled,
}: {
  name: string;
  odds: number;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center justify-between rounded border bg-background px-3 py-2 text-left transition-colors hover:border-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-background"
    >
      <span className="truncate text-xs text-muted-foreground">{name}</span>
      <span className="font-mono font-semibold tabular-nums">{odds.toFixed(2)}</span>
    </button>
  );
}
