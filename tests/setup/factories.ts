import { testDb } from "./db";
import { users, type NewUser } from "@/db/schema";

let counter = 0;

export async function createUser(overrides: Partial<NewUser> = {}) {
  counter++;
  const [u] = await testDb
    .insert(users)
    .values({
      email: overrides.email ?? `user${counter}@test.cz`,
      username: overrides.username ?? `user${counter}`,
      passwordHash: overrides.passwordHash ?? "fake-hash",
      role: overrides.role ?? "user",
      capital: overrides.capital ?? "0",
      ...overrides,
    })
    .returning();
  if (!u) throw new Error("failed to create user");
  return u;
}
