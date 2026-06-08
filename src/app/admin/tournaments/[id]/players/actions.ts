"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { playerService } from "@/lib/player";
import { isAdmin } from "@/lib/roles";

type Result = { ok: true } | { ok: false; error: string };

async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  return isAdmin(session?.user?.role);
}

export async function addPlayer(tournamentId: string, name: string): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  try {
    await playerService.add(tournamentId, name);
    revalidatePath(`/admin/tournaments/${tournamentId}/players`);
    revalidatePath(`/admin/tournaments/${tournamentId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

export async function addPlayerFromUser(
  tournamentId: string,
  userId: string
): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  try {
    await playerService.addFromUser(tournamentId, userId);
    revalidatePath(`/admin/tournaments/${tournamentId}/players`);
    revalidatePath(`/admin/tournaments/${tournamentId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

export async function removePlayer(
  tournamentId: string,
  playerId: string
): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  try {
    await playerService.remove(playerId);
    revalidatePath(`/admin/tournaments/${tournamentId}/players`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

export async function assignPlayerToGroup(
  tournamentId: string,
  playerId: string,
  groupId: string | null
): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  try {
    await playerService.assignToGroup(playerId, groupId);
    revalidatePath(`/admin/tournaments/${tournamentId}/players`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

export async function ensureGroupsForTournament(
  tournamentId: string,
  groupCount: number
): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  try {
    await playerService.ensureGroups(tournamentId, groupCount);
    revalidatePath(`/admin/tournaments/${tournamentId}/players`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

export async function autoAssignPlayers(tournamentId: string): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  try {
    await playerService.autoAssignRandom(tournamentId);
    revalidatePath(`/admin/tournaments/${tournamentId}/players`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}
