"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  startLegAction,
  recordLegAction,
  cancelMatchAction,
} from "@/app/admin/tournaments/[id]/matches/actions";

type Player = { id: string; name: string };
type Leg = {
  id: string;
  legNumber: number;
  status: "pending" | "live" | "finished";
  winnerId: string | null;
};
export type Match = {
  id: string;
  phase: string;
  bestOf: number;
  status: "scheduled" | "live" | "finished" | "cancelled";
  scoreA: number;
  scoreB: number;
  playerA: Player | null;
  playerB: Player | null;
  winnerId: string | null;
  legs: Leg[];
};

export function MatchRow({
  tournamentId,
  match,
  number,
}: {
  tournamentId: string;
  match: Match;
  number?: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const isLive = match.status === "live";
  const isFinished = match.status === "finished" || match.status === "cancelled";
  const liveLeg = match.legs.find((l) => l.status === "live");

  function startLegClick() {
    start(async () => {
      const r = await startLegAction(tournamentId, match.id);
      if (r.ok) {
        toast.success(`Leg ${match.legs.length + 1} spuštěn`);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function recordWinner(winnerId: string) {
    if (!liveLeg) return;
    start(async () => {
      const r = await recordLegAction(tournamentId, liveLeg.id, winnerId);
      if (r.ok) {
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function cancelClick() {
    if (!confirm("Opravdu zrušit zápas?")) return;
    start(async () => {
      const r = await cancelMatchAction(tournamentId, match.id);
      if (r.ok) {
        toast.success("Zápas zrušen");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  const nameA = match.playerA?.name ?? "?";
  const nameB = match.playerB?.name ?? "?";
  const winnerName =
    match.winnerId === match.playerA?.id ? nameA : match.winnerId === match.playerB?.id ? nameB : null;

  return (
    <div className="space-y-3 rounded border p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {number != null && (
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              #{number}
            </span>
          )}
          <Badge variant="outline">{match.phase}</Badge>
          <Badge variant={isLive ? "default" : "secondary"}>{match.status}</Badge>
          <span className="text-muted-foreground">best of {match.bestOf}</span>
        </div>
        {!isFinished && match.status !== "cancelled" && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={cancelClick}>
            Zrušit
          </Button>
        )}
      </div>
      <div className="flex items-center justify-center gap-4 text-lg">
        <span className={match.winnerId === match.playerA?.id ? "font-bold" : ""}>{nameA}</span>
        <span className="font-mono text-2xl">
          {match.scoreA} : {match.scoreB}
        </span>
        <span className={match.winnerId === match.playerB?.id ? "font-bold" : ""}>{nameB}</span>
      </div>
      {winnerName && (
        <p className="text-center text-sm text-green-600 dark:text-green-400">
          Vítěz: {winnerName}
        </p>
      )}
      {!isFinished && match.status !== "cancelled" && (
        <div className="space-y-2">
          {liveLeg ? (
            <div>
              <p className="text-sm text-muted-foreground">Leg {liveLeg.legNumber} běží — kdo vyhrál?</p>
              <div className="mt-2 flex gap-2">
                {match.playerA && (
                  <Button disabled={pending} onClick={() => recordWinner(match.playerA!.id)}>
                    {nameA}
                  </Button>
                )}
                {match.playerB && (
                  <Button disabled={pending} onClick={() => recordWinner(match.playerB!.id)}>
                    {nameB}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            match.playerA &&
            match.playerB && (
              <Button disabled={pending} onClick={startLegClick}>
                {match.legs.length === 0 ? "Spustit zápas (leg 1)" : `Spustit leg ${match.legs.length + 1}`}
              </Button>
            )
          )}
        </div>
      )}
      {match.legs.length > 0 && (
        <ol className="space-y-1 text-xs text-muted-foreground">
          {match.legs.map((l) => (
            <li key={l.id}>
              Leg {l.legNumber}: {l.status}
              {l.winnerId && ` → ${l.winnerId === match.playerA?.id ? nameA : nameB}`}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
