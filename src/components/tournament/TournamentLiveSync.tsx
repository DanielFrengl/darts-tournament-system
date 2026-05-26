"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useLive, type LiveEvent } from "@/lib/use-live";

/**
 * Subscribes to the tournament's pub/sub channel. Refreshes the route
 * so any visible data (matches, odds, standings, bracket) updates
 * automatically, and surfaces match-level events as toasts.
 */
export function TournamentLiveSync({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  useLive([`tournament:${tournamentId}`], (e: LiveEvent) => {
    const data = (e.data ?? {}) as ToastData;
    switch (e.event) {
      case "match_started":
        if (data.summary) {
          toast.info("Zápas začíná", { description: data.summary });
        }
        break;
      case "match_finished":
        if (data.summary) {
          toast.success("Zápas dohrán", { description: data.summary });
        }
        break;
      case "match_cancelled":
        if (data.summary) {
          toast.warning("Zápas zrušen", { description: data.summary });
        }
        break;
      case "playoff_started":
        toast.info("Spuštěn playoff", {
          description: "Skupinová fáze dohrána, začíná pavouk.",
        });
        break;
      case "tournament_finished":
        toast.success("Turnaj dohrán", { description: data.summary });
        break;
      // matches_created, standings_updated, bracket_updated, odds_changed,
      // leg_started, leg_finished — refresh the route silently. No toast.
    }
    router.refresh();
  });
  return null;
}

type ToastData = {
  summary?: string;
};
