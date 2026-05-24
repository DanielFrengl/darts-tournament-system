import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, truncateAll, teardownTestDb, testDb } from "../setup/db";
import { createUser } from "../setup/factories";
import { users, transactions } from "@/db/schema";
import { adjustUserCapital, changeUserRole } from "@/app/admin/users/actions";

beforeAll(async () => {
  await setupTestDb();
});
beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await teardownTestDb();
});

describe("admin actions", () => {
  it("adjustUserCapital credits and writes transaction", async () => {
    const admin = await createUser({ role: "admin", email: "a@a.cz", username: "admin1" });
    const target = await createUser({ capital: "100", email: "t@t.cz", username: "target1" });
    const result = await adjustUserCapital(target.id, 50, "bonus", admin.id);
    expect(result.ok).toBe(true);
    const [updated] = await testDb.select().from(users).where(eq(users.id, target.id));
    expect(updated?.capital).toBe("150.00");
    const txs = await testDb
      .select()
      .from(transactions)
      .where(eq(transactions.userId, target.id));
    expect(txs).toHaveLength(1);
    expect(txs[0]?.createdBy).toBe(admin.id);
    expect(txs[0]?.note).toBe("bonus");
  });

  it("adjustUserCapital rejects negative net balance", async () => {
    const admin = await createUser({ role: "admin", email: "a2@a.cz", username: "admin2" });
    const target = await createUser({ capital: "10", email: "t2@t.cz", username: "target2" });
    const result = await adjustUserCapital(target.id, -50, "fine", admin.id);
    expect(result.ok).toBe(false);
  });

  it("changeUserRole promotes user to admin", async () => {
    const admin = await createUser({ role: "admin", email: "a3@a.cz", username: "admin3" });
    const target = await createUser({ role: "user", email: "t3@t.cz", username: "target3" });
    const result = await changeUserRole(target.id, "admin", admin.id);
    expect(result.ok).toBe(true);
    const [updated] = await testDb.select().from(users).where(eq(users.id, target.id));
    expect(updated?.role).toBe("admin");
  });

  it("changeUserRole prevents admin from demoting themselves", async () => {
    const admin = await createUser({ role: "admin", email: "a4@a.cz", username: "admin4" });
    const result = await changeUserRole(admin.id, "user", admin.id);
    expect(result.ok).toBe(false);
  });
});
