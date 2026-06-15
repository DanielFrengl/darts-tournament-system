import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { appSettings, type AppSettings } from "@/db/schema";

const DEFAULTS: Omit<AppSettings, "updatedAt"> = {
  id: 1,
  name: "Jabloňová Open",
  logoUrl: "/logo.png",
  inviteCode: "darts",
  maxBet: null,
};

/**
 * Singleton row keyed at id=1. cached() so a single request only hits
 * the DB once even if multiple components read it.
 */
export const getAppSettings = cache(async (): Promise<AppSettings> => {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
  if (row) return row;
  const [created] = await db
    .insert(appSettings)
    .values(DEFAULTS)
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  // Race: another request created it; re-read.
  const [again] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
  if (again) return again;
  throw new Error("failed to load settings");
});

export async function updateAppSettings(input: {
  name?: string;
  logoUrl?: string;
  inviteCode?: string;
  maxBet?: number | null;
}): Promise<void> {
  const patch: Partial<typeof appSettings.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    if (input.name.trim().length === 0) throw new Error("name must not be empty");
    patch.name = input.name.trim();
  }
  if (input.logoUrl !== undefined) {
    if (!/^(https?:\/\/|\/)/.test(input.logoUrl)) throw new Error("invalid logo URL");
    patch.logoUrl = input.logoUrl;
  }
  if (input.inviteCode !== undefined) {
    const trimmed = input.inviteCode.trim();
    if (trimmed.length < 3) throw new Error("invite code must be at least 3 chars");
    if (trimmed.length > 64) throw new Error("invite code too long");
    patch.inviteCode = trimmed;
  }
  if (input.maxBet !== undefined) {
    if (input.maxBet === null) {
      patch.maxBet = null; // limit disabled
    } else {
      if (!Number.isFinite(input.maxBet) || input.maxBet <= 0) {
        throw new Error("max bet must be a positive number");
      }
      if (input.maxBet > 1_000_000_000) throw new Error("max bet too large");
      patch.maxBet = input.maxBet.toFixed(2);
    }
  }
  await db
    .insert(appSettings)
    .values({ ...DEFAULTS, ...patch })
    .onConflictDoUpdate({ target: appSettings.id, set: patch });
}

/** Absolute max stake per bet/parlay (in jablka), or null when disabled. */
export async function getMaxBet(): Promise<number | null> {
  const s = await getAppSettings();
  return s.maxBet != null ? Number(s.maxBet) : null;
}

export async function verifyInviteCode(code: string): Promise<boolean> {
  const settings = await getAppSettings();
  // Constant-time-ish compare for the small string; full timing safety
  // isn't critical here (invite codes are low-entropy by design).
  if (code.length !== settings.inviteCode.length) return false;
  let ok = 1;
  for (let i = 0; i < code.length; i++) {
    if (code.charCodeAt(i) !== settings.inviteCode.charCodeAt(i)) ok = 0;
  }
  return ok === 1;
}
