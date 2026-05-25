"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { updateAppSettings } from "@/lib/settings";

type Result = { ok: true } | { ok: false; error: string };

async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === "admin";
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
