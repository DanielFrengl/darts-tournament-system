"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  startLegAction,
  recordLegAction,
  cancelMatchAction,
  undoLastLegAction,
  markUpcomingAction,
  closeLegBettingAction,
} from "@/app/admin/tournaments/[id]/matches/actions";

// Localized labels so the admin runner matches the Czech UI used everywhere
// else instead of leaking raw English enum values (group/scheduled/pending).
const PHASE_LABEL: Record<string, string> = {
  group: "Skupina",
  quarter: "Čtvrtfinále",
  semi: "Semifinále",
  third_place: "O 3. místo",
  final: "Finále",
};
const LEG_STATUS_LABEL: Record<Leg["status"], string> = {
  pending: "čeká",
  live: "běží",
  finished: "hotovo",
};

type Player = { id: string; name: string };
type Leg = {
  id: string;
  legNumber: number;
  status: "pending" | "live" | "finished";
  winnerId: string | null;
  /** Whether the leg_winner market is still open for bets (live leg only). */
  bettingClosed?: boolean;
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
  isUpcoming: boolean;
};

export function MatchRow({
  tournamentId,
  match,
  number,
  hotkeys = false,
}: {
  tournamentId: string;
  match: Match;
  number?: number;
  /** Enable keyboard shortcuts (A/L = leg winner, Z = undo). Only set on the focused match in the play page. */
  hotkeys?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const isLive = match.status === "live";
  const isFinished = match.status === "finished" || match.status === "cancelled";
  const liveLeg = match.legs.find((l) => l.status === "live");
  const canUndo =
    isLive &&
    !liveLeg &&
    match.legs.some((l) => l.status === "finished" && l.winnerId);

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

  function closeBettingClick() {
    if (!liveLeg) return;
    start(async () => {
      const r = await closeLegBettingAction(tournamentId, liveLeg.id);
      if (r.ok) {
        toast.success("Sázky na leg uzavřeny");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function undoClick() {
    if (!canUndo || pending) return;
    if (!confirm("Opravdu vrátit poslední leg? Sázky na tento leg budou vráceny.")) return;
    start(async () => {
      const r = await undoLastLegAction(tournamentId, match.id);
      if (r.ok) {
        toast.success("Poslední leg vrácen — zadej správného vítěze");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function toggleUpcoming() {
    start(async () => {
      const r = await markUpcomingAction(tournamentId, match.id, !match.isUpcoming);
      if (r.ok) {
        toast.success(
          match.isUpcoming ? "Označení zrušeno" : "Zápas označen jako nadcházející"
        );
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

  // Hotkey dispatch goes through a ref so the window listener is bound
  // once while always seeing fresh state (liveLeg, pending, canUndo).
  const hotkeyRef = useRef<(key: string) => void>(() => {});
  const handleHotkey = (key: string) => {
    if (pending) return;
    if (key === "a" && liveLeg && match.playerA) {
      recordWinner(match.playerA.id);
    } else if (key === "l" && liveLeg && match.playerB) {
      recordWinner(match.playerB.id);
    } else if (key === "z" && canUndo) {
      undoClick();
    }
  };
  useEffect(() => {
    hotkeyRef.current = handleHotkey;
  });

  useEffect(() => {
    if (!hotkeys) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key !== "a" && key !== "l" && key !== "z") return;
      e.preventDefault();
      hotkeyRef.current(key);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hotkeys]);

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
          <Badge variant="outline">{PHASE_LABEL[match.phase] ?? match.phase}</Badge>
          <StatusBadge kind="match" status={match.status} />
          {match.isUpcoming && <Badge>Nadcházející</Badge>}
          <span className="text-muted-foreground">best of {match.bestOf}</span>
        </div>
        <div className="flex items-center gap-2">
          {match.status === "scheduled" && (
            <Button
              size="sm"
              variant={match.isUpcoming ? "secondary" : "outline"}
              disabled={pending}
              onClick={toggleUpcoming}
            >
              {match.isUpcoming ? "Zrušit nadcházející" : "Označit jako nadcházející"}
            </Button>
          )}
          {!isFinished && match.status !== "cancelled" && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={cancelClick}>
              Zrušit
            </Button>
          )}
        </div>
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Leg {liveLeg.legNumber} běží — kdo vyhrál?</p>
                {liveLeg.bettingClosed ? (
                  <Badge variant="secondary">Sázky uzavřeny</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={closeBettingClick}
                  >
                    Uzavřít sázky na leg
                  </Button>
                )}
              </div>
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
            <div className="flex flex-wrap gap-2">
              {match.playerA && match.playerB && (
                <Button disabled={pending} onClick={startLegClick}>
                  {match.legs.length === 0 ? "Spustit zápas (leg 1)" : `Spustit leg ${match.legs.length + 1}`}
                </Button>
              )}
              {canUndo && (
                <Button variant="outline" disabled={pending} onClick={undoClick}>
                  Vrátit poslední leg
                </Button>
              )}
            </div>
          )}
          {hotkeys && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>Klávesy:</span>
              <span>
                <kbd className="rounded border bg-muted px-1 font-mono">A</kbd> leg pro {nameA}
              </span>
              <span>
                <kbd className="rounded border bg-muted px-1 font-mono">L</kbd> leg pro {nameB}
              </span>
              <span>
                <kbd className="rounded border bg-muted px-1 font-mono">Z</kbd> vrátit poslední leg
              </span>
            </p>
          )}
        </div>
      )}
      {match.legs.length > 0 && (
        <ol className="space-y-1 text-xs text-muted-foreground">
          {match.legs.map((l) => (
            <li key={l.id}>
              Leg {l.legNumber}: {LEG_STATUS_LABEL[l.status] ?? l.status}
              {l.winnerId && ` → ${l.winnerId === match.playerA?.id ? nameA : nameB}`}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
