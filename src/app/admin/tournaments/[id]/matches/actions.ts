"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  cancelMatchWithMarkets,
  recordLegAndAdvance,
  startLegWithMarkets,
} from "@/lib/leg";

type Result = { ok: true } | { ok: false; error: string };

async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === "admin";
}

export async function startLegAction(
  tournamentId: string,
  matchId: string
): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  try {
    await startLegWithMarkets(matchId);
    revalidatePath(`/admin/tournaments/${tournamentId}/matches`);
    revalidatePath(`/admin/tournaments/${tournamentId}/play`);
    revalidatePath("/tournament");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

export async function recordLegAction(
  tournamentId: string,
  legId: string,
  winnerId: string
): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  try {
    await recordLegAndAdvance(legId, winnerId);
    revalidatePath(`/admin/tournaments/${tournamentId}/matches`);
    revalidatePath(`/admin/tournaments/${tournamentId}/play`);
    revalidatePath("/tournament");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

export async function cancelMatchAction(
  tournamentId: string,
  matchId: string
): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  try {
    await cancelMatchWithMarkets(matchId);
    revalidatePath(`/admin/tournaments/${tournamentId}/matches`);
    revalidatePath(`/admin/tournaments/${tournamentId}/play`);
    revalidatePath("/tournament");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}
