"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { matches } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  cancelMatchWithMarkets,
  recordLegAndAdvance,
  startLegWithMarkets,
  undoLastLegWithMarkets,
} from "@/lib/leg";
import { publish } from "@/lib/event-bus";
import { isAdmin } from "@/lib/roles";

type Result = { ok: true } | { ok: false; error: string };

async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  return isAdmin(session?.user?.role);
}

/**
 * Pin (or un-pin) a match as "upcoming" so it floats to the top of the
 * betting list and the TV "Na řadě" section — giving people time to bet
 * on match_winner / correct_score before the match starts and those
 * markets close. Uses a timestamp so the most recently pinned match wins
 * the top spot. The flag is also cleared automatically when leg 1 starts.
 */
export async function markUpcomingAction(
  tournamentId: string,
  matchId: string,
  upcoming: boolean
): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  try {
    const [m] = await db
      .select({ tournamentId: matches.tournamentId, status: matches.status })
      .from(matches)
      .where(eq(matches.id, matchId));
    if (!m) return { ok: false, error: "Zápas nenalezen" };
    if (upcoming && m.status !== "scheduled") {
      return { ok: false, error: "Označit lze jen nezahájený zápas" };
    }
    await db
      .update(matches)
      .set({ markedUpcomingAt: upcoming ? new Date() : null })
      .where(eq(matches.id, matchId));
    // Refresh every surface that orders by this flag.
    revalidatePath(`/admin/tournaments/${tournamentId}/matches`);
    revalidatePath(`/admin/tournaments/${tournamentId}/play`);
    revalidatePath("/tournament");
    revalidatePath("/sazeni");
    revalidatePath("/display");
    publish(`tournament:${m.tournamentId}`, "upcoming_changed", { matchId });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
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

export async function undoLastLegAction(
  tournamentId: string,
  matchId: string
): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  try {
    await undoLastLegWithMarkets(matchId);
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
