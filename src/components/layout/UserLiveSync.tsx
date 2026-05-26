"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useLive, type LiveEvent } from "@/lib/use-live";

const fmt = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 });

/**
 * Subscribes to the user's personal channel. Refreshes the route on
 * any event so capital / bet status / stats stay in sync, and surfaces
 * bet outcomes (won / lost / refunded) as sonner toasts.
 */
export function UserLiveSync({ userId }: { userId: string }) {
  const router = useRouter();
  useLive([`user:${userId}`], (e: LiveEvent) => {
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
          description: `+${fmt.format(payout)} Chips`,
        }
      );
    } else if (e.event === "bet_lost") {
      const data = (e.data ?? {}) as { kind?: "single" | "parlay"; stake?: number };
      const isParlay = data.kind === "parlay";
      toast.error(isParlay ? "Akumulátor prohrál" : "Sázka neprošla", {
        description: data.stake
          ? `Vklad ${fmt.format(Number(data.stake))} Chips`
          : undefined,
      });
    } else if (e.event === "bet_refunded") {
      const data = (e.data ?? {}) as { refund?: number };
      toast.info("Sázka refundována", {
        description: data.refund
          ? `Vráceno ${fmt.format(Number(data.refund))} Chips`
          : undefined,
      });
    }
    router.refresh();
  });
  return null;
}
