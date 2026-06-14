import { eq, and, ne, isNotNull } from "drizzle-orm";
import type { DB } from "@/db/client";
import { competitors, players, tournaments } from "@/db/schema";

/**
 * Add a player to a tournament seeded from an existing competitor's
 * canonical rating. The player's working elo starts at the competitor's
 * carried rating, and inherits the competitor's linked account (if any).
 */
export async function addPlayerFromCompetitor(
  db: DB,
  tournamentId: string,
  competitorId: string
) {
  const [c] = await db
    .select()
    .from(competitors)
    .where(eq(competitors.id, competitorId));
  if (!c) throw new Error("competitor not found");
  const [p] = await db
    .insert(players)
    .values({
      tournamentId,
      name: c.displayName,
      competitorId: c.id,
      eloRating: c.eloRating,
      userId: c.userId,
    })
    .returning();
  return p!;
}

/**
 * Add a brand-new competitor (starting at the default 1500) and a player
 * for the tournament seeded from it.
 */
export async function addNewcomer(
  db: DB,
  tournamentId: string,
  displayName: string
) {
  const [c] = await db.insert(competitors).values({ displayName }).returning();
  const [p] = await db
    .insert(players)
    .values({
      tournamentId,
      name: displayName,
      competitorId: c!.id,
      eloRating: c!.eloRating,
    })
    .returning();
  return p!;
}

/**
 * Link a competitor to a user account and propagate the account onto the
 * competitor's player rows in non-finished tournaments (so the user shows
 * up as themselves in the current event).
 */
export async function linkCompetitorToUser(
  db: DB,
  competitorId: string,
  userId: string
) {
  await db
    .update(competitors)
    .set({ userId })
    .where(eq(competitors.id, competitorId));
  const rows = await db
    .select({ id: players.id })
    .from(players)
    .innerJoin(tournaments, eq(players.tournamentId, tournaments.id))
    .where(
      and(
        eq(players.competitorId, competitorId),
        ne(tournaments.status, "finished")
      )
    );
  for (const r of rows) {
    await db.update(players).set({ userId }).where(eq(players.id, r.id));
  }
}

/**
 * Manually set a competitor's Elo and lock it so future imports/recomputes
 * won't overwrite the value.
 */
export async function setCompetitorElo(
  db: DB,
  competitorId: string,
  elo: number
) {
  await db
    .update(competitors)
    .set({ eloRating: elo, eloLocked: true })
    .where(eq(competitors.id, competitorId));
}

/** Clear the lock so the next import recomputes this competitor's Elo. */
export async function unlockCompetitorElo(db: DB, competitorId: string) {
  await db
    .update(competitors)
    .set({ eloLocked: false })
    .where(eq(competitors.id, competitorId));
}

/**
 * Copy each player's final working elo back onto its linked competitor.
 * Call when a tournament transitions to `finished` so the carried rating
 * reflects the latest results.
 */
export async function finalizeTournamentRatings(db: DB, tournamentId: string) {
  const rows = await db
    .select()
    .from(players)
    .where(
      and(eq(players.tournamentId, tournamentId), isNotNull(players.competitorId))
    );
  for (const p of rows) {
    if (!p.competitorId) continue;
    await db
      .update(competitors)
      .set({ eloRating: p.eloRating })
      .where(eq(competitors.id, p.competitorId));
  }
}
