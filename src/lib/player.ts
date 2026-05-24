import { and, eq, asc, isNull } from "drizzle-orm";
import { groups, players, tournaments, type Group, type Player } from "@/db/schema";
import type { DB } from "@/db/client";

export class PlayerService {
  constructor(private readonly db: DB) {}

  async list(tournamentId: string): Promise<Player[]> {
    return this.db
      .select()
      .from(players)
      .where(eq(players.tournamentId, tournamentId))
      .orderBy(asc(players.createdAt));
  }

  async listByGroup(tournamentId: string): Promise<Map<string | null, Player[]>> {
    const rows = await this.list(tournamentId);
    const map = new Map<string | null, Player[]>();
    for (const p of rows) {
      const key = p.groupId ?? null;
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }

  async add(tournamentId: string, name: string, avatarUrl?: string): Promise<Player> {
    if (!name.trim()) throw new Error("player name required");
    await this.requireDraft(tournamentId);
    const [row] = await this.db
      .insert(players)
      .values({ tournamentId, name: name.trim(), avatarUrl: avatarUrl ?? null })
      .returning();
    if (!row) throw new Error("failed to add player");
    return row;
  }

  async remove(playerId: string): Promise<void> {
    const [p] = await this.db.select().from(players).where(eq(players.id, playerId));
    if (!p) return;
    await this.requireDraft(p.tournamentId);
    await this.db.delete(players).where(eq(players.id, playerId));
  }

  async assignToGroup(playerId: string, groupId: string | null): Promise<void> {
    const [p] = await this.db.select().from(players).where(eq(players.id, playerId));
    if (!p) throw new Error("player not found");
    await this.requireDraft(p.tournamentId);
    if (groupId) {
      const [g] = await this.db.select().from(groups).where(eq(groups.id, groupId));
      if (!g || g.tournamentId !== p.tournamentId) {
        throw new Error("group does not belong to this tournament");
      }
    }
    await this.db.update(players).set({ groupId }).where(eq(players.id, playerId));
  }

  async ensureGroups(tournamentId: string, groupCount: number): Promise<Group[]> {
    const existing = await this.db
      .select()
      .from(groups)
      .where(eq(groups.tournamentId, tournamentId))
      .orderBy(asc(groups.position));
    if (existing.length >= groupCount) return existing.slice(0, groupCount);
    const toCreate: { tournamentId: string; name: string; position: number }[] = [];
    for (let i = existing.length; i < groupCount; i++) {
      toCreate.push({
        tournamentId,
        name: String.fromCharCode("A".charCodeAt(0) + i),
        position: i,
      });
    }
    if (toCreate.length > 0) {
      await this.db.insert(groups).values(toCreate);
    }
    return this.db
      .select()
      .from(groups)
      .where(eq(groups.tournamentId, tournamentId))
      .orderBy(asc(groups.position));
  }

  async autoAssignRandom(tournamentId: string): Promise<void> {
    const [tournament] = await this.db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));
    if (!tournament) throw new Error("tournament not found");
    if (tournament.status !== "draft") throw new Error("tournament must be in draft");
    const cfg = tournament.configJson as { groupCount: number; groupSize: number };
    const groupList = await this.ensureGroups(tournamentId, cfg.groupCount);
    const allPlayers = await this.list(tournamentId);
    const shuffled = [...allPlayers].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i++) {
      const groupIdx = i % cfg.groupCount;
      const group = groupList[groupIdx];
      if (!group) continue;
      await this.db
        .update(players)
        .set({ groupId: group.id })
        .where(eq(players.id, shuffled[i]!.id));
    }
  }

  async listGroups(tournamentId: string): Promise<Group[]> {
    return this.db
      .select()
      .from(groups)
      .where(eq(groups.tournamentId, tournamentId))
      .orderBy(asc(groups.position));
  }

  async countUnassigned(tournamentId: string): Promise<number> {
    const rows = await this.db
      .select()
      .from(players)
      .where(and(eq(players.tournamentId, tournamentId), isNull(players.groupId)));
    return rows.length;
  }

  private async requireDraft(tournamentId: string): Promise<void> {
    const [t] = await this.db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));
    if (!t) throw new Error("tournament not found");
    if (t.status !== "draft") {
      throw new Error("player edits only allowed in draft");
    }
  }
}

import { db } from "@/db/client";
export const playerService = new PlayerService(db);
