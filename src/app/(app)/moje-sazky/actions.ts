"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { bettingService } from "@/lib/betting";

type Result = { ok: true; refund: number } | { ok: false; error: string };

export async function cancelBetAction(betId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Nejsi přihlášen" };
  const r = await bettingService.cancelBet(session.user.id, betId);
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/moje-sazky");
  revalidatePath("/");
  return { ok: true, refund: r.refund };
}
