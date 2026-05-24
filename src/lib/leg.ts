import { and, eq, asc, max } from "drizzle-orm";
import { legs, matches, type Leg, type Match } from "@/db/schema";
import type { DB } from "@/db/client";

export class LegService {
  constructor(private readonly db: DB) {}

  async list(matchId: string): Promise<Leg[]> {
    return this.db
      .select()
      .from(legs)
      .where(eq(legs.matchId, matchId))
      .orderBy(asc(legs.legNumber));
  }

  async startLeg(matchId: string): Promise<Leg> {
    return this.db.transaction(async (tx) => {
      const [m] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
      if (!m) throw new Error("match not found");
      if (m.status === "finished" || m.status === "cancelled") {
        throw new Error("cannot start leg on a finished or cancelled match");
      }
      if (!m.playerAId || !m.playerBId) {
        throw new Error("match is missing players");
      }
      const [maxLeg] = await tx
        .select({ max: max(legs.legNumber) })
        .from(legs)
        .where(eq(legs.matchId, matchId));
      const nextNumber = (maxLeg?.max ?? 0) + 1;

      const liveLeg = await tx
        .select()
        .from(legs)
        .where(and(eq(legs.matchId, matchId), eq(legs.status, "live")));
      if (liveLeg.length > 0) {
        throw new Error("a leg is already live");
      }

      const [created] = await tx
        .insert(legs)
        .values({
          matchId,
          legNumber: nextNumber,
          status: "live",
          startedAt: new Date(),
        })
        .returning();
      if (!created) throw new Error("failed to start leg");
      if (m.status === "scheduled") {
        await tx
          .update(matches)
          .set({ status: "live" })
          .where(eq(matches.id, matchId));
      }
      return created;
    });
  }

  async recordLeg(legId: string, winnerId: string): Promise<{ match: Match; leg: Leg }> {
    return this.db.transaction(async (tx) => {
      const [leg] = await tx.select().from(legs).where(eq(legs.id, legId)).for("update");
      if (!leg) throw new Error("leg not found");
      if (leg.status !== "live") throw new Error("leg is not live");
      const [m] = await tx
        .select()
        .from(matches)
        .where(eq(matches.id, leg.matchId))
        .for("update");
      if (!m) throw new Error("match not found");
      if (winnerId !== m.playerAId && winnerId !== m.playerBId) {
        throw new Error("winner must be one of the match players");
      }
      const updatedLeg = await tx
        .update(legs)
        .set({ status: "finished", winnerId, finishedAt: new Date() })
        .where(eq(legs.id, legId))
        .returning();
      const newScoreA = winnerId === m.playerAId ? m.scoreA + 1 : m.scoreA;
      const newScoreB = winnerId === m.playerBId ? m.scoreB + 1 : m.scoreB;
      const target = Math.ceil(m.bestOf / 2);
      const matchFinished = newScoreA >= target || newScoreB >= target;
      const updatedMatch = await tx
        .update(matches)
        .set({
          scoreA: newScoreA,
          scoreB: newScoreB,
          status: matchFinished ? "finished" : "live",
          winnerId: matchFinished
            ? newScoreA >= target
              ? m.playerAId
              : m.playerBId
            : null,
          finishedAt: matchFinished ? new Date() : null,
        })
        .where(eq(matches.id, m.id))
        .returning();
      return { match: updatedMatch[0]!, leg: updatedLeg[0]! };
    });
  }

  async cancelMatch(matchId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(legs)
        .set({ status: "finished", finishedAt: new Date() })
        .where(and(eq(legs.matchId, matchId), eq(legs.status, "live")));
      await tx
        .update(matches)
        .set({ status: "cancelled", finishedAt: new Date() })
        .where(eq(matches.id, matchId));
    });
  }
}

import { db } from "@/db/client";
export const legService = new LegService(db);

/**
 * Convenience wrapper used by admin server actions:
 *   1. record the leg + finalize match if needed (LegService),
 *   2. settle leg + match markets (lifecycle),
 *   3. advance bracket + seed markets for new matches (lifecycle).
 * Raw LegService stays free of market/bracket coupling so unit tests
 * can target it in isolation.
 */
export async function recordLegAndAdvance(legId: string, winnerId: string) {
  const { onLegFinished } = await import("@/lib/match-lifecycle");
  const result = await legService.recordLeg(legId, winnerId);
  await onLegFinished({
    legId: result.leg.id,
    matchId: result.match.id,
    legWinnerId: winnerId,
    matchFinished: result.match.status === "finished",
    matchWinnerId: result.match.winnerId,
    scoreA: result.match.scoreA,
    scoreB: result.match.scoreB,
  });
  return result;
}

/**
 * Mirror wrapper: start a leg AND wire the market lifecycle so the
 * leg_winner market opens and (on leg 1) the match markets close.
 */
export async function startLegWithMarkets(matchId: string) {
  const { onLegStarted } = await import("@/lib/match-lifecycle");
  const leg = await legService.startLeg(matchId);
  await onLegStarted(leg.id, matchId, leg.legNumber);
  return leg;
}

/**
 * Wrapper for cancellation that also cancels markets and refunds bets.
 */
export async function cancelMatchWithMarkets(matchId: string) {
  const { onMatchCancelled } = await import("@/lib/match-lifecycle");
  await legService.cancelMatch(matchId);
  await onMatchCancelled(matchId);
}
