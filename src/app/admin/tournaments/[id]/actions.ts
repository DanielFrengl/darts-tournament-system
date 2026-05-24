"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { players, matches } from "@/db/schema";
import { auth } from "@/lib/auth";
import { tournamentService } from "@/lib/tournament";
import { matchService } from "@/lib/match";
import { bracketService } from "@/lib/bracket";
import { marketService } from "@/lib/market";
import { bettingService } from "@/lib/betting";
import { onMatchesCreated } from "@/lib/match-lifecycle";

type Result = { ok: true } | { ok: false; error: string };

async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === "admin";
}

export async function startGroups(tournamentId: string): Promise<Result> {
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
    revalidatePath(`/admin/tournaments/${tournamentId}`);
    revalidatePath("/tournament");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
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
    // Settle tournament-level markets using the final's winner.
    if (final.winnerId) {
      const winning = await marketService.settleTournamentWinner(
        tournamentId,
        final.winnerId
      );
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
