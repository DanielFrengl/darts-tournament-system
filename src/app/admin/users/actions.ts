"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { capitalService } from "@/lib/capital";
import { CapitalAdjustSchema } from "@/lib/validation";

type Result = { ok: true } | { ok: false; error: string };

async function requireAdminId(explicit?: string): Promise<string | null> {
  if (explicit) return explicit;
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") return null;
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
  newRole: "user" | "admin",
  explicitAdminId?: string
): Promise<Result> {
  const adminId = await requireAdminId(explicitAdminId);
  if (!adminId) return { ok: false, error: "Forbidden" };
  if (targetUserId === adminId) return { ok: false, error: "Cannot change your own role" };
  await db.update(users).set({ role: newRole }).where(eq(users.id, targetUserId));
  revalidatePath("/admin/users");
  return { ok: true };
}
