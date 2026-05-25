import { desc, eq, ne } from "drizzle-orm";
import { tournaments, type Tournament } from "@/db/schema";
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
}

function cast(row: Tournament): TournamentWithConfig {
  return { ...row, configJson: row.configJson as TournamentConfig };
}

import { db } from "@/db/client";
export const tournamentService = new TournamentService(db);
