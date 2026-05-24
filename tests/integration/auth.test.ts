import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, truncateAll, teardownTestDb, testDb } from "../setup/db";
import { users } from "@/db/schema";
import { registerUser } from "@/app/(auth)/register/actions";
import { verifyPassword } from "@/lib/password";

beforeAll(async () => {
  await setupTestDb();
});
beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await teardownTestDb();
});

describe("registerUser action", () => {
  it("creates user with hashed password and admin role for first user", async () => {
    const result = await registerUser({
      email: "karel@test.cz",
      username: "karel99",
      password: "longenoughpw",
    });
    expect(result.ok).toBe(true);
    const [u] = await testDb.select().from(users).where(eq(users.email, "karel@test.cz"));
    expect(u).toBeDefined();
    expect(u?.username).toBe("karel99");
    expect(u?.role).toBe("admin");
    expect(await verifyPassword("longenoughpw", u!.passwordHash)).toBe(true);
  });

  it("second user gets role 'user'", async () => {
    await registerUser({ email: "a@a.cz", username: "userA", password: "longenough" });
    await registerUser({ email: "b@b.cz", username: "userB", password: "longenough" });
    const [u] = await testDb.select().from(users).where(eq(users.email, "b@b.cz"));
    expect(u?.role).toBe("user");
  });

  it("rejects duplicate email", async () => {
    await registerUser({ email: "dup@a.cz", username: "first", password: "longenough" });
    const r = await registerUser({
      email: "dup@a.cz",
      username: "second",
      password: "longenough",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/email/i);
  });

  it("rejects duplicate username", async () => {
    await registerUser({ email: "a1@a.cz", username: "samename", password: "longenough" });
    const r = await registerUser({
      email: "a2@a.cz",
      username: "samename",
      password: "longenough",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/username/i);
  });

  it("rejects invalid input", async () => {
    const r = await registerUser({ email: "bad", username: "x", password: "short" });
    expect(r.ok).toBe(false);
  });
});

import { updateBio, updateAvatar, changePassword } from "@/app/(app)/settings/actions";
import { hashPassword } from "@/lib/password";

describe("settings actions", () => {
  it("updateBio updates user bio", async () => {
    const [u] = await testDb
      .insert(users)
      .values({ email: "bio@a.cz", username: "biouser", passwordHash: "x" })
      .returning();
    const result = await updateBio(u!.id, "Hello world");
    expect(result.ok).toBe(true);
    const [updated] = await testDb.select().from(users).where(eq(users.id, u!.id));
    expect(updated?.bio).toBe("Hello world");
  });

  it("updateAvatar updates avatar_url", async () => {
    const [u] = await testDb
      .insert(users)
      .values({ email: "av@a.cz", username: "avuser", passwordHash: "x" })
      .returning();
    const result = await updateAvatar("https://cdn.example.com/x.png", u!.id);
    expect(result.ok).toBe(true);
    const [updated] = await testDb.select().from(users).where(eq(users.id, u!.id));
    expect(updated?.avatarUrl).toBe("https://cdn.example.com/x.png");
  });

  it("updateAvatar rejects non-https URL", async () => {
    const [u] = await testDb
      .insert(users)
      .values({ email: "av2@a.cz", username: "avuser2", passwordHash: "x" })
      .returning();
    const result = await updateAvatar("file:///etc/passwd", u!.id);
    expect(result.ok).toBe(false);
  });

  it("changePassword succeeds with correct current password", async () => {
    const passwordHash = await hashPassword("oldpassword123");
    const [u] = await testDb
      .insert(users)
      .values({ email: "pw@a.cz", username: "pwuser", passwordHash })
      .returning();
    const result = await changePassword(u!.id, "oldpassword123", "newpassword123");
    expect(result.ok).toBe(true);
    const [updated] = await testDb.select().from(users).where(eq(users.id, u!.id));
    expect(await verifyPassword("newpassword123", updated!.passwordHash)).toBe(true);
  });

  it("changePassword fails with wrong current password", async () => {
    const passwordHash = await hashPassword("oldpassword123");
    const [u] = await testDb
      .insert(users)
      .values({ email: "pw2@a.cz", username: "pwuser2", passwordHash })
      .returning();
    const result = await changePassword(u!.id, "WRONG", "newpassword123");
    expect(result.ok).toBe(false);
  });
});
