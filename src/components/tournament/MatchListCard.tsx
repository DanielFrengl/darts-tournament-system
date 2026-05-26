"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import { BetDialog, type BetTarget } from "@/components/betting/BetDialog";
import { LiveDot } from "@/components/ui/live-dot";

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
  totalPool: number;
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
              <Badge variant="default" className="flex items-center gap-1.5 text-xs">
                <LiveDot size="sm" />
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
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Vsazeno celkem:{" "}
                <span className="font-mono text-foreground">
                  {formatPool(match.totalPool)}
                </span>
              </span>
              <Link
                href={`/match/${match.id}`}
                className="flex items-center gap-1 hover:text-foreground"
              >
                Více trhů
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
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

const poolFmt = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 });
function formatPool(pool: number): string {
  if (pool <= 0) return "—";
  return poolFmt.format(pool);
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
      className="group flex cursor-pointer items-center justify-between gap-2 rounded-md border-2 border-amber-500/40 bg-amber-500/5 px-3 py-2.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-amber-400 hover:bg-amber-500/15 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted/40 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:border-border disabled:hover:bg-muted/40 disabled:hover:shadow-sm"
    >
      <span className="truncate text-xs text-muted-foreground group-hover:text-foreground">
        {name}
      </span>
      <span className="font-mono text-base font-bold tabular-nums text-amber-400 group-hover:text-amber-300">
        {odds.toFixed(2)}
      </span>
    </button>
  );
}
