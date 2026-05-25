import "server-only";
import { and, count, eq, sum } from "drizzle-orm";
import { db } from "@/db/client";
import { bets, markets, marketSelections } from "@/db/schema";

export type UserStats = {
  betCount: number;
  won: number;
  lost: number;
  refunded: number;
  open: number;
  totalStaked: number;
  totalReturn: number;
  netProfit: number;
  roi: number | null;
  winRate: number | null;
};

/**
 * Aggregate a user's betting stats. When tournamentId is supplied,
 * only bets placed on markets belonging to that tournament are counted.
 */
export async function userStats(
  userId: string,
  tournamentId?: string
): Promise<UserStats> {
  const baseCount = () => {
    if (tournamentId) {
      return db
        .select({ value: count() })
        .from(bets)
        .innerJoin(marketSelections, eq(marketSelections.id, bets.selectionId))
        .innerJoin(markets, eq(markets.id, marketSelections.marketId));
    }
    return db.select({ value: count() }).from(bets);
  };
  const baseSum = (col: typeof bets.stake | typeof bets.payout) => {
    if (tournamentId) {
      return db
        .select({ value: sum(col) })
        .from(bets)
        .innerJoin(marketSelections, eq(marketSelections.id, bets.selectionId))
        .innerJoin(markets, eq(markets.id, marketSelections.marketId));
    }
    return db.select({ value: sum(col) }).from(bets);
  };
  const scope = (extra?: ReturnType<typeof eq>) => {
    const parts = [eq(bets.userId, userId)];
    if (tournamentId) parts.push(eq(markets.tournamentId, tournamentId));
    if (extra) parts.push(extra);
    return and(...parts);
  };

  const [countRow] = await baseCount().where(scope());
  const [wonRow] = await baseCount().where(scope(eq(bets.status, "won")));
  const [lostRow] = await baseCount().where(scope(eq(bets.status, "lost")));
  const [refundedRow] = await baseCount().where(scope(eq(bets.status, "refunded")));
  const [openRow] = await baseCount().where(scope(eq(bets.status, "open")));
  const [stakeRow] = await baseSum(bets.stake).where(scope());
  const [payoutWonRow] = await baseSum(bets.payout).where(scope(eq(bets.status, "won")));
  const [payoutRefundRow] = await baseSum(bets.payout).where(
    scope(eq(bets.status, "refunded"))
  );

  const totalStaked = Number(stakeRow?.value ?? 0);
  const totalReturn =
    Number(payoutWonRow?.value ?? 0) + Number(payoutRefundRow?.value ?? 0);
  const won = Number(wonRow?.value ?? 0);
  const lost = Number(lostRow?.value ?? 0);
  const refunded = Number(refundedRow?.value ?? 0);
  const open = Number(openRow?.value ?? 0);
  const settled = won + lost;

  return {
    betCount: Number(countRow?.value ?? 0),
    won,
    lost,
    refunded,
    open,
    totalStaked,
    totalReturn,
    netProfit: totalReturn - totalStaked,
    roi: totalStaked > 0 ? ((totalReturn - totalStaked) / totalStaked) * 100 : null,
    winRate: settled > 0 ? (won / settled) * 100 : null,
  };
}
