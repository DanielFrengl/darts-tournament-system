import { desc, eq, ne, inArray } from "drizzle-orm";
import {
  tournaments,
  markets,
  marketSelections,
  bets,
  transactions,
  type Tournament,
} from "@/db/schema";
import type { DB } from "@/db/client";
import { publish } from "@/lib/event-bus";
import {
  TournamentConfigSchema,
  TournamentCreateSchema,
  type TournamentConfig,
  type TournamentCreateInput,
} from "@/lib/tournament-config";

export type TournamentWithConfig = Omit<Tournament, "configJson"> & {
  configJson: TournamentConfig;
};

type Status = Tournament["status"];

const ALLOWED_TRANSITIONS: Record<Status, Status[]> = {
  draft: ["groups"],
  groups: ["playoff"],
  playoff: ["finished"],
  finished: [],
};

export class TournamentService {
  constructor(private readonly db: DB) {}

  async create(input: TournamentCreateInput): Promise<TournamentWithConfig> {
    const parsed = TournamentCreateSchema.parse(input);
    const [row] = await this.db
      .insert(tournaments)
      .values({ name: parsed.name, configJson: parsed.config, status: "draft" })
      .returning();
    if (!row) throw new Error("failed to create tournament");
    return cast(row);
  }

  async get(id: string): Promise<TournamentWithConfig | null> {
    const [row] = await this.db.select().from(tournaments).where(eq(tournaments.id, id));
    return row ? cast(row) : null;
  }

  async list(): Promise<TournamentWithConfig[]> {
    const rows = await this.db.select().from(tournaments).orderBy(desc(tournaments.createdAt));
    return rows.map(cast);
  }

  async getActive(): Promise<TournamentWithConfig | null> {
    const [row] = await this.db
      .select()
      .from(tournaments)
      .where(ne(tournaments.status, "finished"))
      .orderBy(desc(tournaments.createdAt))
      .limit(1);
    return row ? cast(row) : null;
  }

  async updateConfig(id: string, config: TournamentConfig): Promise<void> {
    const validated = TournamentConfigSchema.parse(config);
    const current = await this.get(id);
    if (!current) throw new Error("tournament not found");
    if (current.status !== "draft") {
      throw new Error("config can only be updated while in draft");
    }
    await this.db
      .update(tournaments)
      .set({ configJson: validated })
      .where(eq(tournaments.id, id));
  }

  async transition(id: string, to: Status): Promise<void> {
    const current = await this.get(id);
    if (!current) throw new Error("tournament not found");
    const allowed = ALLOWED_TRANSITIONS[current.status];
    if (!allowed.includes(to)) {
      throw new Error(`invalid transition: ${current.status} → ${to}`);
    }
    const updates: Partial<Tournament> = { status: to };
    if (to === "groups" && !current.startedAt) {
      updates.startedAt = new Date();
    }
    if (to === "finished") {
      updates.finishedAt = new Date();
    }
    await this.db.update(tournaments).set(updates).where(eq(tournaments.id, id));
    publish(`tournament:${id}`, "status_changed", { status: to });
  }

  async rename(id: string, name: string): Promise<void> {
    if (!name.trim()) throw new Error("name required");
    await this.db.update(tournaments).set({ name }).where(eq(tournaments.id, id));
  }

  async delete(id: string): Promise<void> {
    // Cascades handle groups, players, matches, legs, markets, market_selections.
    // bets uses ON DELETE RESTRICT on selection_id, so caller must first
    // clear bets if any exist (only allowed in draft, where bets shouldn't).
    await this.db.delete(tournaments).where(eq(tournaments.id, id));
  }

  /**
   * Debug-only force delete: removes a tournament in ANY phase, first
   * clearing the bets that reference its market selections (which use
   * ON DELETE RESTRICT and would otherwise block the cascade). Parlays
   * cascade-delete their child bets, and transactions referencing those
   * bets via betId (no FK) are detached. All in one transaction.
   */
  async forceDelete(id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const sels = await tx
        .select({ id: marketSelections.id })
        .from(marketSelections)
        .innerJoin(markets, eq(marketSelections.marketId, markets.id))
        .where(eq(markets.tournamentId, id));
      const selectionIds = sels.map((s) => s.id);

      if (selectionIds.length > 0) {
        const betRows = await tx
          .select({ id: bets.id })
          .from(bets)
          .where(inArray(bets.selectionId, selectionIds));
        const betIds = betRows.map((b) => b.id);
        if (betIds.length > 0) {
          // Detach transactions that point at these bets (betId has no FK).
          await tx
            .update(transactions)
            .set({ betId: null })
            .where(inArray(transactions.betId, betIds));
          await tx.delete(bets).where(inArray(bets.id, betIds));
        }
      }

      // Cascades handle groups, players, matches, legs, markets, selections.
      await tx.delete(tournaments).where(eq(tournaments.id, id));
    });
  }
}

function cast(row: Tournament): TournamentWithConfig {
  return { ...row, configJson: row.configJson as TournamentConfig };
}

import { db } from "@/db/client";
export const tournamentService = new TournamentService(db);
