"use client";

import { useRouter } from "next/navigation";
import { useLive } from "@/lib/use-live";

/**
 * Subscribes to the match channel + every market channel passed in and
 * refreshes the route on any event. Keeps the page in sync with leg
 * starts, finishes, score updates, and odds movement caused by other
 * users placing bets.
 */
export function MatchLiveSync({
  matchId,
  marketIds,
}: {
  matchId: string;
  marketIds: string[];
}) {
  const router = useRouter();
  const channels = [`match:${matchId}`, ...marketIds.map((id) => `market:${id}`)];
  useLive(channels, () => {
    router.refresh();
  });
  return null;
}
