import { eq, desc } from "drizzle-orm";
import { users, transactions, type Transaction } from "@/db/schema";
import type { DB } from "@/db/client";

type DebitType = "bet_placed";
type CreditType = "bet_won" | "bet_refund";
type AdjustOpts = { betId?: string | null; note?: string };

export class CapitalService {
  constructor(private readonly db: DB) {}

  async initialDeposit(userId: string, amount: number): Promise<string> {
    if (amount <= 0) throw new Error("initial deposit must be positive");
    return this.db.transaction(async (tx) => {
      const [u] = await tx
        .select({ capital: users.capital })
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      if (!u) throw new Error("user not found");
      const newBalance = (Number(u.capital) + amount).toFixed(2);
      await tx.update(users).set({ capital: newBalance }).where(eq(users.id, userId));
      await tx.insert(transactions).values({
        userId,
        type: "initial",
        amount: amount.toFixed(2),
        balanceAfter: newBalance,
      });
      return newBalance;
    });
  }

  async debit(
    userId: string,
    amount: number,
    type: DebitType,
    opts: AdjustOpts = {}
  ): Promise<string> {
    if (amount <= 0) throw new Error("debit amount must be positive");
    return this.db.transaction(async (tx) => {
      const [u] = await tx
        .select({ capital: users.capital })
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      if (!u) throw new Error("user not found");
      const current = Number(u.capital);
      if (current < amount) throw new Error("insufficient balance");
      const newBalance = (current - amount).toFixed(2);
      await tx.update(users).set({ capital: newBalance }).where(eq(users.id, userId));
      await tx.insert(transactions).values({
        userId,
        type,
        amount: (-amount).toFixed(2),
        balanceAfter: newBalance,
        betId: opts.betId ?? null,
        note: opts.note ?? null,
      });
      return newBalance;
    });
  }

  async credit(
    userId: string,
    amount: number,
    type: CreditType,
    opts: AdjustOpts = {}
  ): Promise<string> {
    if (amount <= 0) throw new Error("credit amount must be positive");
    return this.db.transaction(async (tx) => {
      const [u] = await tx
        .select({ capital: users.capital })
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      if (!u) throw new Error("user not found");
      const newBalance = (Number(u.capital) + amount).toFixed(2);
      await tx.update(users).set({ capital: newBalance }).where(eq(users.id, userId));
      await tx.insert(transactions).values({
        userId,
        type,
        amount: amount.toFixed(2),
        balanceAfter: newBalance,
        betId: opts.betId ?? null,
        note: opts.note ?? null,
      });
      return newBalance;
    });
  }

  async adminAdjust(
    userId: string,
    amount: number,
    note: string,
    adminId: string
  ): Promise<string> {
    if (amount === 0) throw new Error("adjust amount must not be zero");
    if (!note || note.trim().length === 0) throw new Error("note required");
    return this.db.transaction(async (tx) => {
      const [u] = await tx
        .select({ capital: users.capital })
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      if (!u) throw new Error("user not found");
      const current = Number(u.capital);
      const next = current + amount;
      if (next < 0) throw new Error("adjustment would make balance negative");
      const newBalance = next.toFixed(2);
      await tx.update(users).set({ capital: newBalance }).where(eq(users.id, userId));
      await tx.insert(transactions).values({
        userId,
        type: "admin_adjust",
        amount: amount.toFixed(2),
        balanceAfter: newBalance,
        note,
        createdBy: adminId,
      });
      return newBalance;
    });
  }

  async getTransactions(userId: string, limit = 50): Promise<Transaction[]> {
    return this.db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt))
      .limit(limit);
  }

  async getAllTransactions(limit = 100): Promise<Transaction[]> {
    return this.db
      .select()
      .from(transactions)
      .orderBy(desc(transactions.createdAt))
      .limit(limit);
  }
}

import { db } from "@/db/client";
export const capitalService = new CapitalService(db);
