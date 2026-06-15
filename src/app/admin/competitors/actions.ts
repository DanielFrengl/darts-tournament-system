"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { markets, marketSelections, competitors, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { displayName } from "@/lib/names";
import {
  linkCompetitorToUser,
  setCompetitorElo,
  unlockCompetitorElo,
} from "@/lib/competitor";
import { marketService } from "@/lib/market";

type Result = { ok: true } | { ok: false; error: string };

async function ensureAdmin(): Promise<boolean> {
  const session = await auth();
  return !!session?.user && isAdmin(session.user.role);
}

export async function linkAction(formData: FormData): Promise<Result> {
  if (!(await ensureAdmin())) return { ok: false, error: "Nedostatečná práva" };
  const competitorId = String(formData.get("competitorId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!competitorId || !userId)
    return { ok: false, error: "Chybí hráč nebo uživatel" };
  await linkCompetitorToUser(db, competitorId, userId);
  revalidatePath("/admin/competitors");
  return { ok: true };
}

export async function createNewcomerForUserAction(
  formData: FormData
): Promise<Result> {
  if (!(await ensureAdmin())) return { ok: false, error: "Nedostatečná práva" };
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { ok: false, error: "Chybí uživatel" };

  // Don't create a duplicate if this user is already linked to a competitor.
  const existing = await db
    .select({ id: competitors.id })
    .from(competitors)
    .where(eq(competitors.userId, userId));
  if (existing[0]) return { ok: false, error: "Uživatel už je spárovaný" };

  const [u] = await db
    .select({
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!u) return { ok: false, error: "Uživatel nenalezen" };

  // Newcomer competitor at the default 1500, linked to the account.
  await db
    .insert(competitors)
    .values({ displayName: displayName(u), userId });
  revalidatePath("/admin/competitors");
  return { ok: true };
}

export async function setEloAction(formData: FormData): Promise<Result> {
  if (!(await ensureAdmin())) return { ok: false, error: "Nedostatečná práva" };
  const competitorId = String(formData.get("competitorId") ?? "");
  const elo = Number(formData.get("elo"));
  if (!competitorId || !Number.isFinite(elo) || elo < 0 || elo > 4000)
    return { ok: false, error: "Neplatné Elo (0–4000)" };
  await setCompetitorElo(db, competitorId, Math.round(elo));
  revalidatePath("/admin/competitors");
  return { ok: true };
}

export async function unlockEloAction(formData: FormData): Promise<Result> {
  if (!(await ensureAdmin())) return { ok: false, error: "Nedostatečná práva" };
  const competitorId = String(formData.get("competitorId") ?? "");
  if (!competitorId) return { ok: false, error: "Chybí hráč" };
  await unlockCompetitorElo(db, competitorId);
  revalidatePath("/admin/competitors");
  return { ok: true };
}

export async function recomputeOddsAction(formData: FormData): Promise<Result> {
  if (!(await ensureAdmin())) return { ok: false, error: "Nedostatečná práva" };
  const tournamentId = String(formData.get("tournamentId") ?? "");
  if (!tournamentId) return { ok: false, error: "Chybí turnaj" };

  const futures = [
    "tournament_winner",
    "tournament_runner_up",
    "tournament_third",
  ] as const;
  try {
    // Drop existing futures markets (selections cascade) then re-create them
    // from the current ratings. Fails if bets already reference them.
    const existing = await db
      .select({ id: markets.id })
      .from(markets)
      .where(
        and(
          eq(markets.tournamentId, tournamentId),
          inArray(markets.type, futures)
        )
      );
    const ids = existing.map((m) => m.id);
    if (ids.length > 0) {
      await db
        .delete(marketSelections)
        .where(inArray(marketSelections.marketId, ids));
      await db.delete(markets).where(inArray(markets.id, ids));
    }
    await marketService.createTournamentWinner(tournamentId);
    await marketService.createTournamentPlaces(tournamentId);
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Přepočet selhal (existují už sázky?)",
    };
  }
  revalidatePath("/admin/competitors");
  return { ok: true };
}
