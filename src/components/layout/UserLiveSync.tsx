"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useLive, type LiveEvent } from "@/lib/use-live";
import { formatJablka } from "@/lib/jablka";

/**
 * Subscribes to the user's personal channel (bet outcomes) and, when a
 * tournament is active, to that tournament's channel (match start / end).
 * Refreshes the route on any event so capital / bet status / standings
 * stay in sync, and surfaces toast notifications via sonner.
 */
export function UserLiveSync({
  userId,
  tournamentId,
}: {
  userId: string;
  tournamentId?: string | null;
}) {
  const router = useRouter();
  // Guard against duplicate toasts for the same match transition (e.g. a
  // re-emitted event), keyed by `${event}:${matchId}`.
  const seen = useRef<Set<string>>(new Set());
  const channels = [`user:${userId}`];
  if (tournamentId) channels.push(`tournament:${tournamentId}`);
  useLive(channels, (e: LiveEvent) => {
    if (e.event === "bet_won") {
      const data = (e.data ?? {}) as {
        payout?: number;
        kind?: "single" | "parlay";
        legs?: number;
      };
      const payout = Number(data.payout ?? 0);
      const isParlay = data.kind === "parlay";
      toast.success(
        isParlay
          ? `Akumulátor (${data.legs}×) vyhrál!`
          : "Sázka vyhrála!",
        {
          description: `+${formatJablka(payout)}`,
        }
      );
    } else if (e.event === "bet_lost") {
      const data = (e.data ?? {}) as { kind?: "single" | "parlay"; stake?: number };
      const isParlay = data.kind === "parlay";
      toast.error(isParlay ? "Akumulátor prohrál" : "Sázka neprošla", {
        description: data.stake
          ? `Vklad ${formatJablka(Number(data.stake))}`
          : undefined,
      });
    } else if (e.event === "bet_refunded") {
      const data = (e.data ?? {}) as { refund?: number };
      toast.info("Sázka refundována", {
        description: data.refund
          ? `Vráceno ${formatJablka(Number(data.refund))}`
          : undefined,
      });
    } else if (e.event === "match_started") {
      const data = (e.data ?? {}) as {
        matchId?: string;
        playerA?: string;
        playerB?: string;
      };
      const key = `match_started:${data.matchId ?? ""}`;
      if (!data.matchId || !seen.current.has(key)) {
        seen.current.add(key);
        toast.info("Začal zápas", {
          description:
            data.playerA && data.playerB
              ? `${data.playerA} vs ${data.playerB}`
              : undefined,
        });
      }
    } else if (e.event === "match_finished") {
      const data = (e.data ?? {}) as {
        matchId?: string;
        winner?: string;
        scoreA?: number;
        scoreB?: number;
      };
      const key = `match_finished:${data.matchId ?? ""}`;
      if (!data.matchId || !seen.current.has(key)) {
        seen.current.add(key);
        const hasScore =
          typeof data.scoreA === "number" && typeof data.scoreB === "number";
        toast("Zápas skončil", {
          description:
            data.winner && hasScore
              ? `${data.winner} vyhrál ${data.scoreA}:${data.scoreB}`
              : data.winner
                ? `Vyhrál ${data.winner}`
                : undefined,
        });
      }
    }
    router.refresh();
  });
  return null;
}
