"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { bettingService } from "@/lib/betting";

export type PlaceParlayResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function placeParlayAction(
  selectionIds: string[],
  stake: number
): Promise<PlaceParlayResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Musíš být přihlášen" };
  const r = await bettingService.placeParlay(session.user.id, selectionIds, stake);
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/bets");
  revalidatePath("/");
  revalidatePath("/bet-builder");
  return { ok: true, id: r.parlay.id };
}
