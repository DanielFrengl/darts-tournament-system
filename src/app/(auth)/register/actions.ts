"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { RegisterSchema, type RegisterInput } from "@/lib/validation";

export type RegisterResult = { ok: true; userId: string } | { ok: false; error: string };

export async function registerUser(input: RegisterInput): Promise<RegisterResult> {
  const parsed = RegisterSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const { email, username, password } = parsed.data;

  const [existingEmail] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (existingEmail) return { ok: false, error: "Email already registered" };

  const [existingUsername] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username));
  if (existingUsername) return { ok: false, error: "Username already taken" };

  const [countRow] = await db.select({ id: users.id }).from(users).limit(1);
  const isFirstUser = !countRow;

  const passwordHash = await hashPassword(password);
  const [created] = await db
    .insert(users)
    .values({
      email,
      username,
      passwordHash,
      role: isFirstUser ? "admin" : "user",
      capital: "0",
    })
    .returning({ id: users.id });

  if (!created) return { ok: false, error: "Failed to create user" };
  return { ok: true, userId: created.id };
}
