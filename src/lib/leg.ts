import { and, eq, asc, max } from "drizzle-orm";
import { legs, matches, type Leg, type Match } from "@/db/schema";
import type { DB } from "@/db/client";
import { BracketService } from "@/lib/bracket";

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
 * Convenience wrapper that records a leg AND advances the bracket if
 * the match just finished. Use this from server actions; raw LegService
 * stays pure for tests that don't want bracket side-effects.
 */
export async function recordLegAndAdvance(legId: string, winnerId: string) {
  const result = await legService.recordLeg(legId, winnerId);
  if (result.match.status === "finished") {
    const bracketService = new BracketService(db);
    await bracketService.advanceWinner(result.match.id);
  }
  return result;
}
