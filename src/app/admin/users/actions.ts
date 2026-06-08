"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { users, bets, parlays, transactions, players } from "@/db/schema";
import { auth } from "@/lib/auth";
import { capitalService } from "@/lib/capital";
import { CapitalAdjustSchema } from "@/lib/validation";
import { isAdmin, isDebug, type Role } from "@/lib/roles";
import { defaultTournamentConfig } from "@/lib/tournament-config";

type Result = { ok: true } | { ok: false; error: string };

async function requireAdminId(explicit?: string): Promise<string | null> {
  if (explicit) return explicit;
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) return null;
  return session.user.id;
}

async function requireDebugId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user || !isDebug(session.user.role)) return null;
  return session.user.id;
}

export async function adjustUserCapital(
  targetUserId: string,
  amount: number,
  note: string,
  explicitAdminId?: string
): Promise<Result> {
  const adminId = await requireAdminId(explicitAdminId);
  if (!adminId) return { ok: false, error: "Forbidden" };
  const parsed = CapitalAdjustSchema.safeParse({ amount, note });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await capitalService.adminAdjust(targetUserId, amount, note, adminId);
    revalidatePath("/admin/users");
    revalidatePath("/admin/audit");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

export async function changeUserRole(
  targetUserId: string,
  newRole: Role,
  explicitAdminId?: string
): Promise<Result> {
  const adminId = await requireAdminId(explicitAdminId);
  if (!adminId) return { ok: false, error: "Forbidden" };
  if (targetUserId === adminId) return { ok: false, error: "Cannot change your own role" };
  const callerIsDebug = (await requireDebugId()) !== null;
  // Only a debug user can grant the debug role, or change the role of an
  // existing debug user. A regular admin must never touch the super-role.
  if (newRole === "debug" && !callerIsDebug) {
    return { ok: false, error: "Pouze debug může povýšit na debug" };
  }
  const [target] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, targetUserId));
  if (!target) return { ok: false, error: "Uživatel nenalezen" };
  if (target.role === "debug" && !callerIsDebug) {
    return { ok: false, error: "Pouze debug může změnit roli debug uživatele" };
  }
  await db.update(users).set({ role: newRole }).where(eq(users.id, targetUserId));
  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * DEBUG-ONLY: permanently delete a user and all dependent rows. Player
 * links (players.userId) are nulled rather than deleting the player rows
 * so tournament history stays intact. Runs in a single
 * transaction so FK constraints (bets/parlays/transactions use RESTRICT)
 * are satisfied. You can never delete yourself.
 */
export async function deleteUser(targetUserId: string): Promise<Result> {
  const debugId = await requireDebugId();
  if (!debugId) return { ok: false, error: "Forbidden" };
  if (targetUserId === debugId) {
    return { ok: false, error: "Nelze smazat sám sebe" };
  }
  try {
    await db.transaction(async (tx) => {
      // Detach player rows from the user (keep history).
      await tx
        .update(players)
        .set({ userId: null })
        .where(eq(players.userId, targetUserId));
      // Remove the user's bets, parlays, and transactions (all RESTRICT on
      // user_id). Bets first (they reference parlays via cascade, but we
      // delete by user_id to be exhaustive), then parlays, then ledger.
      await tx.delete(bets).where(eq(bets.userId, targetUserId));
      await tx.delete(parlays).where(eq(parlays.userId, targetUserId));
      await tx.delete(transactions).where(eq(transactions.userId, targetUserId));
      await tx.delete(users).where(eq(users.id, targetUserId));
    });
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? `Smazání selhalo: ${err.message}` : "Smazání selhalo",
    };
  }
}

/**
 * DEBUG-ONLY: reset every player's stats. Clears all bets, parlays, and
 * transactions and sets every user's capital back to the default starting
 * value. Single transaction so it's all-or-nothing.
 */
export async function resetAllStats(): Promise<Result> {
  const debugId = await requireDebugId();
  if (!debugId) return { ok: false, error: "Forbidden" };
  const startingCapital = defaultTournamentConfig().startingCapital;
  try {
    await db.transaction(async (tx) => {
      await tx.delete(bets);
      await tx.delete(parlays);
      await tx.delete(transactions);
      await tx.update(users).set({ capital: startingCapital.toFixed(2) });
    });
    revalidatePath("/admin/users");
    revalidatePath("/admin/audit");
    revalidatePath("/leaderboard");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? `Reset selhal: ${err.message}` : "Reset selhal",
    };
  }
}
