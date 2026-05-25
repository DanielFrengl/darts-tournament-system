"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { verifyInviteCode } from "@/lib/settings";
import { makeUsername } from "@/lib/names";
import { RegisterSchema, type RegisterInput } from "@/lib/validation";

export type RegisterResult = { ok: true; userId: string } | { ok: false; error: string };

export async function registerUser(
  input: RegisterInput & { inviteCode: string }
): Promise<RegisterResult> {
  const parsed = RegisterSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const { email, firstName, lastName, password } = parsed.data;

  const code = (input.inviteCode ?? "").trim();
  if (!code) return { ok: false, error: "Zadej zvací kód." };
  const codeOk = await verifyInviteCode(code);
  if (!codeOk) return { ok: false, error: "Neplatný zvací kód." };

  const [existingEmail] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (existingEmail) return { ok: false, error: "Email už je registrován." };

  const base = makeUsername(firstName, lastName);
  if (!base) return { ok: false, error: "Z jména nelze vytvořit uživatelské jméno." };
  const username = await findFreeUsername(base);

  const [countRow] = await db.select({ id: users.id }).from(users).limit(1);
  const isFirstUser = !countRow;

  const passwordHash = await hashPassword(password);
  const [created] = await db
    .insert(users)
    .values({
      email,
      username,
      firstName,
      lastName,
      passwordHash,
      role: isFirstUser ? "admin" : "user",
      capital: "0",
    })
    .returning({ id: users.id });

  if (!created) return { ok: false, error: "Nepodařilo se vytvořit účet." };
  return { ok: true, userId: created.id };
}

async function findFreeUsername(base: string): Promise<string> {
  let candidate = base;
  let suffix = 2;
  // Stop at 50 to avoid pathological loops; collisions on real names are rare.
  while (suffix < 50) {
    const [hit] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, candidate));
    if (!hit) return candidate;
    candidate = `${base}${suffix}`;
    suffix++;
  }
  // Fallback: timestamp-suffixed
  return `${base}${Date.now().toString(36)}`;
}
