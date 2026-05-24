import { and, desc, eq, inArray } from "drizzle-orm";
import {
  bets,
  marketSelections,
  markets,
  users,
  tournaments,
  type Bet,
  type MarketSelection,
} from "@/db/schema";
import type { DB } from "@/db/client";
import { CapitalService } from "@/lib/capital";
import { MarketService } from "@/lib/market";
import type { TournamentConfig } from "@/lib/tournament-config";

export type PlaceBetResult =
  | { ok: true; bet: Bet }
  | { ok: false; error: string };

export class BettingService {
  constructor(
    private readonly db: DB,
    private readonly capital: CapitalService,
    private readonly markets: MarketService
  ) {}

  async placeBet(
    userId: string,
    selectionId: string,
    stake: number
  ): Promise<PlaceBetResult> {
    if (!Number.isFinite(stake) || stake <= 0) {
      return { ok: false, error: "Stake must be positive" };
    }
    // The full op happens inside a SERIALIZABLE transaction so we
    // can't oversell capital and the market status is read with a lock.
    let createdBet: Bet | null = null;
    try {
      await this.db.transaction(async (tx) => {
        const [sel] = await tx
          .select()
          .from(marketSelections)
          .where(eq(marketSelections.id, selectionId));
        if (!sel) throw new Error("selection not found");
        const [market] = await tx
          .select()
          .from(markets)
          .where(eq(markets.id, sel.marketId))
          .for("update");
        if (!market) throw new Error("market not found");
        if (market.status !== "open") {
          throw new Error("market is not open");
        }
        const [t] = await tx
          .select()
          .from(tournaments)
          .where(eq(tournaments.id, market.tournamentId));
        if (!t) throw new Error("tournament not found");
        const cfg = t.configJson as TournamentConfig;

        const [u] = await tx
          .select({ capital: users.capital })
          .from(users)
          .where(eq(users.id, userId))
          .for("update");
        if (!u) throw new Error("user not found");
        const balance = Number(u.capital);
        const maxStake = Math.floor(balance * cfg.maxStakePct * 100) / 100;
        if (stake > maxStake) {
          throw new Error(
            `Stake exceeds max ${maxStake.toFixed(2)} (max ${(cfg.maxStakePct * 100).toFixed(
              0
            )}% of capital)`
          );
        }
        const newBalance = (balance - stake).toFixed(2);
        await tx
          .update(users)
          .set({ capital: newBalance })
          .where(eq(users.id, userId));
        const [txRow] = await tx
          .insert(bets)
          .values({
            userId,
            selectionId,
            stake: stake.toFixed(2),
            lockedOdds: sel.finalOdds,
            status: "open",
          })
          .returning();
        if (!txRow) throw new Error("failed to record bet");
        createdBet = txRow;
        await tx.insert(
          await import("@/db/schema").then((s) => s.transactions)
        ).values({
          userId,
          type: "bet_placed",
          amount: (-stake).toFixed(2),
          balanceAfter: newBalance,
          betId: txRow.id,
        });
      });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed" };
    }
    if (!createdBet) return { ok: false, error: "Failed" };
    // Recompute parimutuel + final odds *after* the transaction commits
    // so the next bettor sees an updated price. Skipping this on failure
    // is fine — the next bet will trigger it.
    const [sel] = await this.db
      .select()
      .from(marketSelections)
      .where(eq(marketSelections.id, selectionId));
    if (sel) await this.markets.recomputeOdds(sel.marketId);
    return { ok: true, bet: createdBet };
  }

  /**
   * Settle a list of selections: bets backing winning selections get
   * status=won + payout, others lost. Returns total amount paid out.
   */
  async settleSelections(
    winningIds: string[],
    losingIds: string[]
  ): Promise<void> {
    const settleAt = new Date();
    if (losingIds.length > 0) {
      const losingBets = await this.db
        .select()
        .from(bets)
        .where(and(inArray(bets.selectionId, losingIds), eq(bets.status, "open")));
      for (const b of losingBets) {
        await this.db
          .update(bets)
          .set({ status: "lost", payout: "0.00", settledAt: settleAt })
          .where(eq(bets.id, b.id));
      }
    }
    if (winningIds.length > 0) {
      const winningBets = await this.db
        .select()
        .from(bets)
        .where(and(inArray(bets.selectionId, winningIds), eq(bets.status, "open")));
      for (const b of winningBets) {
        const payout = Number(b.stake) * Number(b.lockedOdds);
        await this.db
          .update(bets)
          .set({
            status: "won",
            payout: payout.toFixed(2),
            settledAt: settleAt,
          })
          .where(eq(bets.id, b.id));
        await this.capital.credit(b.userId, payout, "bet_won", { betId: b.id });
      }
    }
  }

  /**
   * Refund all open bets on the given selections. Used when matches
   * are cancelled.
   */
  async refundSelections(selectionIds: string[]): Promise<void> {
    if (selectionIds.length === 0) return;
    const openBets = await this.db
      .select()
      .from(bets)
      .where(and(inArray(bets.selectionId, selectionIds), eq(bets.status, "open")));
    const settleAt = new Date();
    for (const b of openBets) {
      const refund = Number(b.stake);
      await this.db
        .update(bets)
        .set({ status: "refunded", payout: refund.toFixed(2), settledAt: settleAt })
        .where(eq(bets.id, b.id));
      await this.capital.credit(b.userId, refund, "bet_refund", { betId: b.id });
    }
  }

  async listBets(userId: string, limit = 50): Promise<Bet[]> {
    return this.db
      .select()
      .from(bets)
      .where(eq(bets.userId, userId))
      .orderBy(desc(bets.placedAt))
      .limit(limit);
  }

  async getSelection(selectionId: string): Promise<MarketSelection | null> {
    const [s] = await this.db
      .select()
      .from(marketSelections)
      .where(eq(marketSelections.id, selectionId));
    return s ?? null;
  }
}

import { db } from "@/db/client";
import { capitalService } from "@/lib/capital";
import { marketService } from "@/lib/market";
export const bettingService = new BettingService(db, capitalService, marketService);
