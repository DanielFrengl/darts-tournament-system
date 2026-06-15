"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { updateAppSettings } from "@/lib/settings";
import { isAdmin } from "@/lib/roles";

type Result = { ok: true } | { ok: false; error: string };

async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  return isAdmin(session?.user?.role);
}

export async function updateSystemName(name: string): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  try {
    await updateAppSettings({ name });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

export async function updateSystemLogo(logoUrl: string): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  try {
    await updateAppSettings({ logoUrl });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

export async function updateInviteCode(code: string): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  try {
    await updateAppSettings({ inviteCode: code });
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

/**
 * Set the absolute max stake allowed on a single bet/parlay. Pass `null`
 * to disable the limit entirely (only the per-tournament % cap applies).
 */
export async function updateMaxBet(maxBet: number | null): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  try {
    await updateAppSettings({ maxBet });
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

export async function regenerateInviteCode(): Promise<Result & { code?: string }> {
  if (!(await requireAdmin())) return { ok: false, error: "Forbidden" };
  const code = randomCode();
  try {
    await updateAppSettings({ inviteCode: code });
    revalidatePath("/admin/settings");
    return { ok: true, code };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

function randomCode(): string {
  // 8-char base32-ish (no easily-confused chars), case-insensitive.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}
