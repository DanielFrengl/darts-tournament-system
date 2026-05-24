"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { players, matches } from "@/db/schema";
import { auth } from "@/lib/auth";
import { tournamentService } from "@/lib/tournament";
import { matchService } from "@/lib/match";
import { bracketService } from "@/lib/bracket";

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
    revalidatePath(`/admin/tournaments/${tournamentId}`);
    revalidatePath("/tournament");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}
