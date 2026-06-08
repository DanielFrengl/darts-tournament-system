"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { players, matches, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { tournamentService } from "@/lib/tournament";
import { matchService } from "@/lib/match";
import { bracketService } from "@/lib/bracket";
import { marketService } from "@/lib/market";
import { bettingService } from "@/lib/betting";
import { capitalService } from "@/lib/capital";
import { onMatchesCreated } from "@/lib/match-lifecycle";
import { isAdmin, isDebug } from "@/lib/roles";

type Result = { ok: true } | { ok: false; error: string };
type StartResult =
  | { ok: true; firstMatchId: string | null }
  | { ok: false; error: string };

export async function renameTournament(
  tournamentId: string,
  name: string
): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Název je povinný" };
  if (trimmed.length > 100) return { ok: false, error: "Název je moc dlouhý" };
  try {
    await tournamentService.rename(tournamentId, trimmed);
    revalidatePath(`/admin/tournaments/${tournamentId}`);
    revalidatePath("/admin/tournaments");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

export async function updateAdvancePerGroup(
  tournamentId: string,
  advancePerGroup: number
): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  if (!Number.isInteger(advancePerGroup) || advancePerGroup < 1) {
    return { ok: false, error: "Nevalidní hodnota" };
  }
  const t = await tournamentService.get(tournamentId);
  if (!t) return { ok: false, error: "Turnaj nenalezen" };
  if (t.status === "playoff" || t.status === "finished") {
    return {
      ok: false,
      error: "Nelze měnit po vytvoření pavouka",
    };
  }
  const total = advancePerGroup * t.configJson.groupCount;
  if (total !== 2 && total !== 4 && total !== 8 && total !== 16) {
    return {
      ok: false,
      error: `Celkem ${total} postupujících není mocnina 2 (potřeba 2/4/8/16)`,
    };
  }
  if (advancePerGroup > t.configJson.groupSize) {
    return {
      ok: false,
      error: "Postupujících víc než hráčů ve skupině",
    };
  }
  try {
    await tournamentService.updateConfig(tournamentId, {
      ...t.configJson,
      advancePerGroup,
    });
    revalidatePath(`/admin/tournaments/${tournamentId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

export async function deleteTournament(tournamentId: string): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  const debug = await requireDebug();
  const t = await tournamentService.get(tournamentId);
  if (!t) return { ok: false, error: "Turnaj nenalezen" };
  // Debug users may force-delete a tournament in any phase; regular admins
  // are restricted to draft/finished as before.
  if (!debug && t.status !== "draft" && t.status !== "finished") {
    return {
      ok: false,
      error: "Smazat lze jen turnaj v přípravě nebo už dohraný",
    };
  }
  try {
    if (debug) {
      await tournamentService.forceDelete(tournamentId);
    } else {
      await tournamentService.delete(tournamentId);
    }
    revalidatePath("/admin/tournaments");
    revalidatePath("/tournament");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Smazání selhalo: ${err.message}`
          : "Smazání selhalo",
    };
  }
}

async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  return isAdmin(session?.user?.role);
}

async function requireDebug(): Promise<boolean> {
  const session = await auth();
  return isDebug(session?.user?.role);
}

async function currentAdminId(): Promise<string | null> {
  const session = await auth();
  if (isAdmin(session?.user?.role)) return session!.user.id;
  return null;
}

export async function startGroups(tournamentId: string): Promise<StartResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  const t = await tournamentService.get(tournamentId);
  if (!t) return { ok: false, error: "Tournament not found" };
  if (t.status !== "draft") return { ok: false, error: "Tournament is not in draft" };

  const groupedPlayers = await db
    .select()
    .from(players)
    .where(eq(players.tournamentId, tournamentId));
  const cfg = t.configJson;
  const assigned = groupedPlayers.filter((p) => p.groupId !== null);
  if (assigned.length < cfg.groupCount * 2) {
    return { ok: false, error: "Each group needs at least 2 assigned players" };
  }
  const unassigned = groupedPlayers.length - assigned.length;
  if (unassigned > 0) {
    return { ok: false, error: `${unassigned} players have no group assigned` };
  }

  try {
    await matchService.generateGroupMatches(tournamentId);
    await tournamentService.transition(tournamentId, "groups");
    const groupMatches = await matchService.listGroupMatches(tournamentId);
    await onMatchesCreated(groupMatches.map((m) => m.id));
    await marketService.createTournamentWinner(tournamentId);
    await marketService.createTournamentPlaces(tournamentId);
    const adminId = await currentAdminId();
    if (adminId) await resetCapitalForTournament(cfg.startingCapital, adminId);
    revalidatePath(`/admin/tournaments/${tournamentId}`);
    revalidatePath("/tournament");
    revalidatePath("/");
    const firstMatchId = groupMatches[0]?.id ?? null;
    return { ok: true, firstMatchId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

/**
 * Reset every user's capital to the tournament's starting amount. Each
 * tournament starts everyone on a level playing field; all-time profit
 * is tracked via the audit log / transactions, not the current balance.
 */
async function resetCapitalForTournament(
  target: number,
  adminId: string
): Promise<void> {
  if (!target || target <= 0) return;
  const allUsers = await db.select({ id: users.id, capital: users.capital }).from(users);
  for (const u of allUsers) {
    const current = Number(u.capital);
    const diff = target - current;
    if (diff === 0) continue;
    await capitalService.adminAdjust(
      u.id,
      diff,
      "Reset kapitálu na začátku turnaje",
      adminId
    );
  }
}

export async function createBracket(tournamentId: string): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  const t = await tournamentService.get(tournamentId);
  if (!t) return { ok: false, error: "Tournament not found" };
  if (t.status !== "groups") {
    return { ok: false, error: "Tournament is not in groups phase" };
  }
  const groupMatches = await matchService.listGroupMatches(tournamentId);
  const unfinished = groupMatches.filter((m) => m.status !== "finished" && m.status !== "cancelled");
  if (unfinished.length > 0) {
    return { ok: false, error: `${unfinished.length} group matches still unfinished` };
  }

  try {
    await bracketService.createBracket(tournamentId);
    await tournamentService.transition(tournamentId, "playoff");
    const all = await matchService.listByTournament(tournamentId);
    const playoff = all.filter((m) => m.phase !== "group");
    await onMatchesCreated(playoff.map((m) => m.id));
    // Close tournament futures once the playoff starts — no more bets
    // on the open field; settle later when the final concludes.
    await marketService.closeTournamentMarkets(tournamentId);
    revalidatePath(`/admin/tournaments/${tournamentId}`);
    revalidatePath("/tournament");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

export async function finishTournament(tournamentId: string): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  const t = await tournamentService.get(tournamentId);
  if (!t) return { ok: false, error: "Tournament not found" };
  if (t.status !== "playoff") return { ok: false, error: "Tournament is not in playoff" };

  const playoffMatches = await db
    .select()
    .from(matches)
    .where(eq(matches.tournamentId, tournamentId));
  const final = playoffMatches.find((m) => m.phase === "final");
  if (!final || final.status !== "finished") {
    return { ok: false, error: "Final has not finished yet" };
  }
  try {
    await tournamentService.transition(tournamentId, "finished");
    // Settle tournament-level markets using final results.
    if (final.winnerId) {
      const runnerUpId =
        final.playerAId === final.winnerId ? final.playerBId : final.playerAId;
      const w = await marketService.settleTournamentPlace(
        tournamentId,
        "tournament_winner",
        final.winnerId
      );
      const ru = runnerUpId
        ? await marketService.settleTournamentPlace(
            tournamentId,
            "tournament_runner_up",
            runnerUpId
          )
        : [];
      const thirdMatch = playoffMatches.find(
        (m) => m.phase === "third_place" && m.status === "finished"
      );
      const third = thirdMatch?.winnerId
        ? await marketService.settleTournamentPlace(
            tournamentId,
            "tournament_third",
            thirdMatch.winnerId
          )
        : [];
      const winning = [...w, ...ru, ...third];
      const allTourSelections = await tournamentSelectionIds(tournamentId);
      const losing = allTourSelections.filter((id) => !winning.includes(id));
      await bettingService.settleSelections(winning, losing);
    }
    revalidatePath(`/admin/tournaments/${tournamentId}`);
    revalidatePath("/tournament");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

async function tournamentSelectionIds(tournamentId: string): Promise<string[]> {
  const { markets, marketSelections } = await import("@/db/schema");
  const ms = await db
    .select()
    .from(markets)
    .where(eq(markets.tournamentId, tournamentId));
  const tourScoped = ms.filter((m) => m.scope === "tournament");
  const out: string[] = [];
  for (const m of tourScoped) {
    const sels = await db
      .select({ id: marketSelections.id })
      .from(marketSelections)
      .where(eq(marketSelections.marketId, m.id));
    for (const s of sels) out.push(s.id);
  }
  return out;
}
