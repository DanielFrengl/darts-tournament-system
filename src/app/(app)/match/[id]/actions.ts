"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { bettingService } from "@/lib/betting";

type Result = { ok: true; payout: number } | { ok: false; error: string };

export async function placeBetAction(
  selectionId: string,
  stake: number,
  matchId: string
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };
  const r = await bettingService.placeBet(session.user.id, selectionId, stake);
  if (!r.ok) return { ok: false, error: r.error };
  const payout = Number(r.bet.stake) * Number(r.bet.lockedOdds);
  revalidatePath(`/match/${matchId}`);
  revalidatePath("/bets");
  revalidatePath("/");
  return { ok: true, payout };
}
