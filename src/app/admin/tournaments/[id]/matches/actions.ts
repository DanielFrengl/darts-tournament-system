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
import {
  restoreMatch,
  closeLegBetting,
  setMatchBestOf,
  type RestoredMatch,
} from "@/lib/match-lifecycle";
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

/**
 * Change how many legs a single not-yet-started match is played to, without
 * touching the rest of its round. Voids and reseeds the match's pre-match
 * books, refunding anything already staked on them — the scorelines those
 * bets were placed on don't exist at the new length.
 */
export async function setMatchBestOfAction(
  tournamentId: string,
  matchId: string,
  bestOf: number
): Promise<
  { ok: true; changed: boolean; refunded: number } | { ok: false; error: string }
> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  try {
    const r = await setMatchBestOf(matchId, bestOf);
    revalidatePath(`/admin/tournaments/${tournamentId}/matches`);
    revalidatePath(`/admin/tournaments/${tournamentId}/play`);
    revalidatePath("/tournament");
    revalidatePath("/sazeni");
    revalidatePath("/display");
    return { ok: true, ...r };
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

/**
 * Close betting on the live leg early (anti-sniping) — without recording a
 * winner yet. Settlement still happens when the winner is recorded.
 */
export async function closeLegBettingAction(
  tournamentId: string,
  legId: string
): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  try {
    await closeLegBetting(legId);
    revalidatePath(`/admin/tournaments/${tournamentId}/matches`);
    revalidatePath(`/admin/tournaments/${tournamentId}/play`);
    revalidatePath("/tournament");
    revalidatePath("/sazeni");
    revalidatePath("/display");
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

/**
 * Undo an accidental cancellation. A match that had never started goes back
 * to scheduled with its books reopened; one that was already being played
 * comes back live, with the legs it had recorded intact and the leg that was
 * cut off handed back to the scorer.
 */
export async function restoreMatchAction(
  tournamentId: string,
  matchId: string
): Promise<
  ({ ok: true } & RestoredMatch) | { ok: false; error: string }
> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  try {
    const restored = await restoreMatch(matchId);
    revalidatePath(`/admin/tournaments/${tournamentId}/matches`);
    revalidatePath(`/admin/tournaments/${tournamentId}/play`);
    revalidatePath("/tournament");
    revalidatePath("/sazeni");
    revalidatePath("/display");
    return { ok: true, ...restored };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}
