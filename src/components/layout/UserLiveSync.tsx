"use client";

import { useRouter } from "next/navigation";
import { useLive } from "@/lib/use-live";

/**
 * Refresh the current route whenever the logged-in user's capital
 * changes (bet placed, bet won, refunded, admin adjustment). Mount in
 * the (app) and admin layouts so the header capital chip + any nested
 * stats stay in sync without manual reload.
 */
export function UserLiveSync({ userId }: { userId: string }) {
  const router = useRouter();
  useLive([`user:${userId}`], () => router.refresh());
  return null;
}
