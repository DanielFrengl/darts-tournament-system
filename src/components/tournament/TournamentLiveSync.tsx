"use client";

import { useRouter } from "next/navigation";
import { useLive } from "@/lib/use-live";

export function TournamentLiveSync({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  useLive([`tournament:${tournamentId}`], () => {
    router.refresh();
  });
  return null;
}
