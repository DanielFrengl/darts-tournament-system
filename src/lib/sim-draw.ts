import { asc, eq } from "drizzle-orm";
import { groups, players } from "@/db/schema";
import type { DB } from "@/db/client";

/**
 * The group draw as it stands, as player ids per group in group order
 * (A, B, C…) — the shape `simulateTournament` takes as `draw`.
 *
 * Once the draw has happened it is a fact, and re-drawing groups in every
 * simulated run would price a tournament nobody is playing: a favorite
 * already stuck in a group with the second seed would come out looking
 * better than they are. Returns undefined while the draw is still open
 * (no groups yet, or players not all assigned), which leaves the
 * simulation drawing groups itself.
 */
export async function loadGroupDraw(
  db: DB,
  tournamentId: string
): Promise<string[][] | undefined> {
  const groupRows = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.tournamentId, tournamentId))
    .orderBy(asc(groups.position));
  if (groupRows.length === 0) return undefined;

  const playerRows = await db
    .select({ id: players.id, groupId: players.groupId })
    .from(players)
    .where(eq(players.tournamentId, tournamentId));
  if (playerRows.length === 0) return undefined;

  const byGroup = new Map<string, string[]>(groupRows.map((g) => [g.id, []]));
  for (const p of playerRows) {
    if (!p.groupId) return undefined; // draw not finished
    const bucket = byGroup.get(p.groupId);
    if (!bucket) return undefined; // stale group reference
    bucket.push(p.id);
  }
  return groupRows.map((g) => byGroup.get(g.id)!);
}
