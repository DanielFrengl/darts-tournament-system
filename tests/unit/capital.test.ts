import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, truncateAll, teardownTestDb, testDb } from "../setup/db";
import { createUser } from "../setup/factories";
import { transactions } from "@/db/schema";
import { CapitalService } from "@/lib/capital";

const service = new CapitalService(testDb);

beforeAll(async () => {
  await setupTestDb();
});
beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await teardownTestDb();
});

describe("CapitalService", () => {
  it("initialDeposit sets balance and logs transaction", async () => {
    const u = await createUser({ capital: "0" });
    const newBalance = await service.initialDeposit(u.id, 1000);
    expect(newBalance).toBe("1000.00");
    const txs = await testDb.select().from(transactions).where(eq(transactions.userId, u.id));
    expect(txs).toHaveLength(1);
    expect(txs[0]?.type).toBe("initial");
    expect(txs[0]?.amount).toBe("1000.00");
    expect(txs[0]?.balanceAfter).toBe("1000.00");
  });

  it("debit reduces balance and logs transaction", async () => {
    const u = await createUser({ capital: "500" });
    const newBalance = await service.debit(u.id, 200, "bet_placed", {
      betId: null,
      note: "test bet",
    });
    expect(newBalance).toBe("300.00");
    const tx = (await testDb.select().from(transactions).where(eq(transactions.userId, u.id)))[0];
    expect(tx?.amount).toBe("-200.00");
    expect(tx?.balanceAfter).toBe("300.00");
    expect(tx?.type).toBe("bet_placed");
  });

  it("debit rejects when insufficient balance", async () => {
    const u = await createUser({ capital: "100" });
    await expect(service.debit(u.id, 200, "bet_placed")).rejects.toThrow(/insufficient/i);
    const txs = await testDb.select().from(transactions).where(eq(transactions.userId, u.id));
    expect(txs).toHaveLength(0);
  });

  it("credit increases balance and logs transaction", async () => {
    const u = await createUser({ capital: "100" });
    const newBalance = await service.credit(u.id, 50, "bet_won", { betId: null });
    expect(newBalance).toBe("150.00");
    const tx = (await testDb.select().from(transactions).where(eq(transactions.userId, u.id)))[0];
    expect(tx?.amount).toBe("50.00");
    expect(tx?.balanceAfter).toBe("150.00");
  });

  it("adminAdjust positive credits with admin id and note", async () => {
    const admin = await createUser({ role: "admin", username: "admin1", email: "a@a.cz" });
    const u = await createUser({ capital: "100", username: "u1", email: "u1@a.cz" });
    await service.adminAdjust(u.id, 25, "bonus", admin.id);
    const tx = (await testDb.select().from(transactions).where(eq(transactions.userId, u.id)))[0];
    expect(tx?.amount).toBe("25.00");
    expect(tx?.note).toBe("bonus");
    expect(tx?.createdBy).toBe(admin.id);
  });

  it("adminAdjust negative debits with admin id and note", async () => {
    const admin = await createUser({ role: "admin", username: "admin2", email: "a2@a.cz" });
    const u = await createUser({ capital: "100", username: "u2", email: "u2@a.cz" });
    await service.adminAdjust(u.id, -30, "correction", admin.id);
    const tx = (await testDb.select().from(transactions).where(eq(transactions.userId, u.id)))[0];
    expect(tx?.amount).toBe("-30.00");
    expect(tx?.balanceAfter).toBe("70.00");
  });

  it("adminAdjust rejects if it would push balance negative", async () => {
    const admin = await createUser({ role: "admin", username: "admin3", email: "a3@a.cz" });
    const u = await createUser({ capital: "10", username: "u3", email: "u3@a.cz" });
    await expect(service.adminAdjust(u.id, -50, "correction", admin.id)).rejects.toThrow(
      /negative/i
    );
  });

  it("getTransactions returns user transactions in reverse chronological order", async () => {
    const u = await createUser({ capital: "0" });
    await service.initialDeposit(u.id, 1000);
    await service.debit(u.id, 100, "bet_placed");
    await service.credit(u.id, 50, "bet_won");
    const list = await service.getTransactions(u.id, 10);
    expect(list).toHaveLength(3);
    expect(list[0]?.type).toBe("bet_won");
    expect(list[2]?.type).toBe("initial");
  });
});
