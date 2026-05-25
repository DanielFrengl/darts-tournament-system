import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { appSettings, type AppSettings } from "@/db/schema";

const DEFAULTS: Omit<AppSettings, "updatedAt"> = {
  id: 1,
  name: "Jabloňová Open",
  logoUrl: "/logo.png",
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
  await db
    .insert(appSettings)
    .values({ ...DEFAULTS, ...patch })
    .onConflictDoUpdate({ target: appSettings.id, set: patch });
}
