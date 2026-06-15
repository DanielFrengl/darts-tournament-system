"use server";

import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { displayName } from "@/lib/names";
import { formatBugReport } from "@/lib/bug-report";

type Result = { ok: true } | { ok: false; error: string };

export async function reportBugAction(
  message: string,
  pageUrl: string
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Musíš být přihlášený." };
  if (!message.trim()) return { ok: false, error: "Napiš prosím popis chyby." };

  const webhook = process.env.DISCORD_BUG_WEBHOOK_URL;
  if (!webhook)
    return { ok: false, error: "Hlášení chyb zatím není nastavené." };

  const [u] = await db
    .select({
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(eq(users.id, session.user.id));
  const who = u ? `${displayName(u)} (@${u.username})` : session.user.id;

  const content = formatBugReport({
    message: message.trim(),
    user: who,
    pageUrl,
    at: new Date(),
  });

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) return { ok: false, error: "Nepodařilo se odeslat." };
  } catch {
    return { ok: false, error: "Nepodařilo se odeslat." };
  }
  return { ok: true };
}
