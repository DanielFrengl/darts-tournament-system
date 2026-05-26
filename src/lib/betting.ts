import { and, desc, eq, inArray } from "drizzle-orm";
import {
  bets,
  marketSelections,
  markets,
  parlays,
  users,
  tournaments,
  type Bet,
  type MarketSelection,
  type Parlay,
} from "@/db/schema";
import type { DB } from "@/db/client";
import { CapitalService } from "@/lib/capital";
import { MarketService } from "@/lib/market";
import type { TournamentConfig } from "@/lib/tournament-config";

export type PlaceBetResult =
  | { ok: true; bet: Bet }
  | { ok: false; error: string };

export type PlaceParlayResult =
  | { ok: true; parlay: Parlay }
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
    const [sel] = await this.db
      .select()
      .from(marketSelections)
      .where(eq(marketSelections.id, selectionId));
    if (sel) await this.markets.recomputeOdds(sel.marketId);
    return { ok: true, bet: createdBet };
  }

  /**
   * Place a parlay (akumulátor): one stake on N selections, payout =
   * stake × product(odds) if all win. Rules:
   *   - 2..10 selections
   *   - All selections must belong to different markets
   *   - All markets must be currently open
   *   - User must have stake worth of capital, capped at maxStakePct
   */
  async placeParlay(
    userId: string,
    selectionIds: string[],
    stake: number
  ): Promise<PlaceParlayResult> {
    if (!Number.isFinite(stake) || stake <= 0) {
      return { ok: false, error: "Vklad musí být kladný" };
    }
    if (selectionIds.length < 2) {
      return { ok: false, error: "Akumulátor potřebuje aspoň 2 výběry" };
    }
    if (selectionIds.length > 10) {
      return { ok: false, error: "Maximálně 10 výběrů v akumulátoru" };
    }
    if (new Set(selectionIds).size !== selectionIds.length) {
      return { ok: false, error: "Duplicitní výběr" };
    }

    let createdParlay: Parlay | null = null;
    try {
      await this.db.transaction(async (tx) => {
        const sels = await tx
          .select()
          .from(marketSelections)
          .where(inArray(marketSelections.id, selectionIds));
        if (sels.length !== selectionIds.length) {
          throw new Error("Nevalidní výběr");
        }
        const marketIds = Array.from(new Set(sels.map((s) => s.marketId)));
        if (marketIds.length !== sels.length) {
          throw new Error("Nelze kombinovat dva výběry ze stejného trhu");
        }
        const ms = await tx
          .select()
          .from(markets)
          .where(inArray(markets.id, marketIds))
          .for("update");
        for (const m of ms) {
          if (m.status !== "open") {
            throw new Error("Některý trh už není otevřený");
          }
        }
        const tournamentId = ms[0]!.tournamentId;
        const [t] = await tx
          .select()
          .from(tournaments)
          .where(eq(tournaments.id, tournamentId));
        if (!t) throw new Error("Turnaj nenalezen");
        const cfg = t.configJson as TournamentConfig;

        const [u] = await tx
          .select({ capital: users.capital })
          .from(users)
          .where(eq(users.id, userId))
          .for("update");
        if (!u) throw new Error("Uživatel neexistuje");
        const balance = Number(u.capital);
        const maxStake = Math.floor(balance * cfg.maxStakePct * 100) / 100;
        if (stake > maxStake) {
          throw new Error(
            `Vklad přesahuje max ${maxStake.toFixed(2)} (${(cfg.maxStakePct * 100).toFixed(0)}% kapitálu)`
          );
        }

        // Combined odds = product of each selection's final odds.
        const combinedOdds = sels.reduce(
          (acc, s) => acc * Number(s.finalOdds),
          1
        );
        const newBalance = (balance - stake).toFixed(2);
        await tx
          .update(users)
          .set({ capital: newBalance })
          .where(eq(users.id, userId));

        const [pRow] = await tx
          .insert(parlays)
          .values({
            userId,
            stake: stake.toFixed(2),
            lockedOdds: combinedOdds.toFixed(4),
            status: "open",
          })
          .returning();
        if (!pRow) throw new Error("Vytvoření selhalo");
        createdParlay = pRow;

        // Child bets: stake=0 placeholder (actual stake lives on parlay).
        for (const s of sels) {
          await tx.insert(bets).values({
            userId,
            selectionId: s.id,
            parlayId: pRow.id,
            stake: "0.00",
            lockedOdds: s.finalOdds,
            status: "open",
          });
        }

        await tx.insert(
          await import("@/db/schema").then((s) => s.transactions)
        ).values({
          userId,
          type: "bet_placed",
          amount: (-stake).toFixed(2),
          balanceAfter: newBalance,
          note: `Akumulátor ${sels.length}×, kurz ${combinedOdds.toFixed(2)}`,
        });
      });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed" };
    }
    if (!createdParlay) return { ok: false, error: "Failed" };
    // Refresh affected market odds (parimutuel pool changed).
    const sels = await this.db
      .select({ marketId: marketSelections.marketId })
      .from(marketSelections)
      .where(inArray(marketSelections.id, selectionIds));
    const uniqMarkets = Array.from(new Set(sels.map((s) => s.marketId)));
    for (const mid of uniqMarkets) {
      await this.markets.recomputeOdds(mid);
    }
    return { ok: true, parlay: createdParlay };
  }

  /**
   * Settle a list of selections: bets backing winning selections get
   * status=won + payout, others lost. Parlay children are handled
   * specially — capital is only credited when the whole parlay resolves.
   */
  async settleSelections(
    winningIds: string[],
    losingIds: string[]
  ): Promise<void> {
    const settleAt = new Date();
    const affectedParlayIds = new Set<string>();

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
        if (b.parlayId) affectedParlayIds.add(b.parlayId);
      }
    }
    if (winningIds.length > 0) {
      const winningBets = await this.db
        .select()
        .from(bets)
        .where(and(inArray(bets.selectionId, winningIds), eq(bets.status, "open")));
      for (const b of winningBets) {
        if (b.parlayId) {
          // Parlay child: record the win but don't credit yet.
          const payout = Number(b.lockedOdds); // informational
          await this.db
            .update(bets)
            .set({
              status: "won",
              payout: payout.toFixed(2),
              settledAt: settleAt,
            })
            .where(eq(bets.id, b.id));
          affectedParlayIds.add(b.parlayId);
        } else {
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

    // Resolve any parlays whose children are now all settled.
    for (const parlayId of affectedParlayIds) {
      await this.resolveParlay(parlayId);
    }
  }

  /**
   * Refund all open bets on the given selections. Used when matches
   * are cancelled. For parlay children, the parlay as a whole is
   * refunded.
   */
  async refundSelections(selectionIds: string[]): Promise<void> {
    if (selectionIds.length === 0) return;
    const openBets = await this.db
      .select()
      .from(bets)
      .where(and(inArray(bets.selectionId, selectionIds), eq(bets.status, "open")));
    const settleAt = new Date();
    const affectedParlayIds = new Set<string>();
    for (const b of openBets) {
      if (b.parlayId) {
        await this.db
          .update(bets)
          .set({ status: "refunded", payout: "0.00", settledAt: settleAt })
          .where(eq(bets.id, b.id));
        affectedParlayIds.add(b.parlayId);
      } else {
        const refund = Number(b.stake);
        await this.db
          .update(bets)
          .set({ status: "refunded", payout: refund.toFixed(2), settledAt: settleAt })
          .where(eq(bets.id, b.id));
        await this.capital.credit(b.userId, refund, "bet_refund", { betId: b.id });
      }
    }
    for (const parlayId of affectedParlayIds) {
      await this.resolveParlay(parlayId);
    }
  }

  /**
   * Compute the outcome of a parlay given its child bets:
   *   - any child still open → wait
   *   - any child refunded → refund the whole parlay (stake back)
   *   - any child lost → parlay lost
   *   - all children won → parlay won, payout = stake × lockedOdds
   */
  private async resolveParlay(parlayId: string): Promise<void> {
    const [p] = await this.db
      .select()
      .from(parlays)
      .where(eq(parlays.id, parlayId));
    if (!p || p.status !== "open") return;
    const childBets = await this.db
      .select()
      .from(bets)
      .where(eq(bets.parlayId, parlayId));
    if (childBets.length === 0) return;
    if (childBets.some((b) => b.status === "open")) return;

    const settleAt = new Date();
    if (childBets.some((b) => b.status === "refunded")) {
      const refund = Number(p.stake);
      await this.db
        .update(parlays)
        .set({
          status: "refunded",
          payout: refund.toFixed(2),
          settledAt: settleAt,
        })
        .where(eq(parlays.id, parlayId));
      await this.capital.credit(p.userId, refund, "bet_refund");
      return;
    }
    if (childBets.some((b) => b.status === "lost")) {
      await this.db
        .update(parlays)
        .set({ status: "lost", payout: "0.00", settledAt: settleAt })
        .where(eq(parlays.id, parlayId));
      return;
    }
    // All children won.
    const payout = Number(p.stake) * Number(p.lockedOdds);
    await this.db
      .update(parlays)
      .set({
        status: "won",
        payout: payout.toFixed(2),
        settledAt: settleAt,
      })
      .where(eq(parlays.id, parlayId));
    await this.capital.credit(p.userId, payout, "bet_won");
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
