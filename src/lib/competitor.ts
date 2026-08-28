import { eq, and, asc, ne, isNotNull, isNull } from "drizzle-orm";
import type { DB } from "@/db/client";
import { competitors, matches, players, tournaments } from "@/db/schema";
import { updateRatings } from "@/lib/elo";

export type Competitor = typeof competitors.$inferSelect;

/**
 * The competitor an account should play as, creating one if this is the
 * user's first tournament.
 *
 * Match order matters. An account already linked to a competitor wins
 * outright. Otherwise we adopt an *unlinked* competitor carrying the same
 * display name — that is the row the history importers create, and it holds
 * the rating this person actually earned. Only if neither exists do we mint a
 * newcomer at the default 1500.
 *
 * Competitors already linked to a different account are never claimed.
 */
export async function resolveCompetitorForUser(
  db: DB,
  userId: string,
  displayName: string
): Promise<Competitor> {
  const [linked] = await db
    .select()
    .from(competitors)
    .where(eq(competitors.userId, userId));
  if (linked) return linked;

  const name = displayName.trim();
  if (name) {
    const [unlinked] = await db
      .select()
      .from(competitors)
      .where(
        and(eq(competitors.displayName, name), isNull(competitors.userId))
      );
    if (unlinked) {
      const [claimed] = await db
        .update(competitors)
        .set({ userId })
        .where(eq(competitors.id, unlinked.id))
        .returning();
      if (claimed) return claimed;
    }
  }

  const [created] = await db
    .insert(competitors)
    .values({ displayName: name || "Hráč", userId })
    .returning();
  if (!created) throw new Error("failed to create competitor");
  return created;
}

/**
 * The competitor an offline (account-less) player plays as, matched on
 * display name — the same key `scripts/import-*.ts` use to upsert history.
 * Creates a newcomer at 1500 when the name is new.
 *
 * The competitor's linked account is deliberately NOT copied onto the
 * player: the admin picked "offline", so the player row stays account-less
 * even when the name belongs to a registered competitor.
 */
export async function resolveCompetitorByName(
  db: DB,
  displayName: string
): Promise<Competitor> {
  const name = displayName.trim();
  if (!name) throw new Error("competitor name required");
  const [existing] = await db
    .select()
    .from(competitors)
    .where(eq(competitors.displayName, name));
  if (existing) return existing;
  const [created] = await db
    .insert(competitors)
    .values({ displayName: name })
    .returning();
  if (!created) throw new Error("failed to create competitor");
  return created;
}

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
 * Repair a tournament whose players were created without a rating — the
 * state that makes every market open at an even 2.00.
 *
 * For each player: attach the competitor they should have been seeded from
 * (creating one if genuinely new), reset the working elo to that carried
 * baseline, then replay this tournament's finished matches in the order they
 * were played so in-tournament drift is preserved rather than thrown away.
 *
 * Refuses on a finished tournament: `finalizeTournamentRatings` has already
 * written the working elo back onto the competitors, so replaying from that
 * baseline would count the same results twice.
 */
export async function resyncPlayerRatings(
  db: DB,
  tournamentId: string
): Promise<{ players: number; linked: number; replayed: number }> {
  const [t] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId));
  if (!t) throw new Error("Turnaj nenalezen");
  if (t.status === "finished") {
    throw new Error("Dohraný turnaj už má ratingy zapsané zpět na hráče");
  }

  const roster = await db
    .select()
    .from(players)
    .where(eq(players.tournamentId, tournamentId));

  let linked = 0;
  const rating = new Map<string, number>();
  const baseline = new Map<string, number>();
  for (const p of roster) {
    let competitorId = p.competitorId;
    let carried: number;
    if (competitorId) {
      const [c] = await db
        .select()
        .from(competitors)
        .where(eq(competitors.id, competitorId));
      carried = c?.eloRating ?? p.eloRating;
    } else {
      const c = p.userId
        ? await resolveCompetitorForUser(db, p.userId, p.name)
        : await resolveCompetitorByName(db, p.name);
      competitorId = c.id;
      carried = c.eloRating;
      linked++;
    }
    rating.set(p.id, carried);
    baseline.set(p.id, carried);
    await db
      .update(players)
      .set({ competitorId, eloRating: carried })
      .where(eq(players.id, p.id));
  }

  // Replay in the order the matches actually finished, mirroring the
  // incremental update the live scorer applies as each match ends.
  const played = await db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.tournamentId, tournamentId),
        eq(matches.status, "finished"),
        isNotNull(matches.finishedAt)
      )
    )
    .orderBy(asc(matches.finishedAt));

  let replayed = 0;
  for (const m of played) {
    if (!m.playerAId || !m.playerBId || !m.winnerId) continue;
    const rA = rating.get(m.playerAId);
    const rB = rating.get(m.playerBId);
    if (rA === undefined || rB === undefined) continue;
    const { nextA, nextB } = updateRatings(
      rA,
      rB,
      m.winnerId === m.playerAId ? "A" : "B"
    );
    rating.set(m.playerAId, nextA);
    rating.set(m.playerBId, nextB);
    replayed++;
  }

  for (const p of roster) {
    const final = rating.get(p.id);
    // Compare against the baseline just written, not the stale row: a replay
    // that lands back on the player's old value still has to overwrite the
    // baseline sitting in the database.
    if (final === undefined || final === baseline.get(p.id)) continue;
    await db
      .update(players)
      .set({ eloRating: final })
      .where(eq(players.id, p.id));
  }

  return { players: roster.length, linked, replayed };
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
