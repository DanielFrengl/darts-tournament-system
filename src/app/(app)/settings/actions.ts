"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { ProfileUpdateSchema } from "@/lib/validation";

type Result = { ok: true } | { ok: false; error: string };

async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function updateBio(
  userIdOrBioWhenSession: string,
  bioMaybe?: string
): Promise<Result> {
  let userId: string | null;
  let bio: string;
  if (bioMaybe === undefined) {
    userId = await getCurrentUserId();
    bio = userIdOrBioWhenSession;
  } else {
    userId = userIdOrBioWhenSession;
    bio = bioMaybe;
  }
  if (!userId) return { ok: false, error: "Not authenticated" };
  const parsed = ProfileUpdateSchema.safeParse({ bio });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  await db.update(users).set({ bio }).where(eq(users.id, userId));
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateAvatar(url: string, explicitUserId?: string): Promise<Result> {
  const userId = explicitUserId ?? (await getCurrentUserId());
  if (!userId) return { ok: false, error: "Not authenticated" };
  if (!/^https?:\/\//.test(url)) return { ok: false, error: "Invalid URL" };
  await db.update(users).set({ avatarUrl: url }).where(eq(users.id, userId));
  revalidatePath("/settings");
  return { ok: true };
}

export async function changePassword(
  userIdOrCurrentWhenSession: string,
  currentMaybeOrNew: string,
  newMaybe?: string
): Promise<Result> {
  let userId: string | null;
  let currentPassword: string;
  let newPassword: string;
  if (newMaybe === undefined) {
    userId = await getCurrentUserId();
    currentPassword = userIdOrCurrentWhenSession;
    newPassword = currentMaybeOrNew;
  } else {
    userId = userIdOrCurrentWhenSession;
    currentPassword = currentMaybeOrNew;
    newPassword = newMaybe;
  }
  if (!userId) return { ok: false, error: "Not authenticated" };
  const parsed = ProfileUpdateSchema.safeParse({ currentPassword, newPassword });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const [u] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId));
  if (!u) return { ok: false, error: "User not found" };
  const ok = await verifyPassword(currentPassword, u.passwordHash);
  if (!ok) return { ok: false, error: "Current password is incorrect" };
  const newHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, userId));
  return { ok: true };
}
