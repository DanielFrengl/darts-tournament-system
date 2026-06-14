import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, truncateAll, teardownTestDb, testDb } from "../setup/db";
import { competitors, players, tournaments } from "@/db/schema";
import {
  addPlayerFromCompetitor,
  addNewcomer,
  finalizeTournamentRatings,
} from "@/lib/competitor";

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(truncateAll);

describe("competitor seeding", () => {
  it("seeds player elo from the linked competitor", async () => {
    const [c] = await testDb
      .insert(competitors)
      .values({ displayName: "Honza", eloRating: 1712 })
      .returning();
    const [t] = await testDb
      .insert(tournaments)
      .values({ name: "T3", status: "draft", configJson: {} })
      .returning();

    const player = await addPlayerFromCompetitor(testDb, t!.id, c!.id);

    expect(player.eloRating).toBe(1712);
    expect(player.competitorId).toBe(c!.id);
  });

  it("creates a fresh competitor at 1500 for a newcomer", async () => {
    const [t] = await testDb
      .insert(tournaments)
      .values({ name: "T3", status: "draft", configJson: {} })
      .returning();

    const player = await addNewcomer(testDb, t!.id, "Nováček");

    expect(player.eloRating).toBe(1500);
    const [c] = await testDb
      .select()
      .from(competitors)
      .where(eq(competitors.id, player.competitorId!));
    expect(c!.eloRating).toBe(1500);
  });

  it("writes final player elo back to competitor on finalize", async () => {
    const [c] = await testDb
      .insert(competitors)
      .values({ displayName: "Honza", eloRating: 1500 })
      .returning();
    const [t] = await testDb
      .insert(tournaments)
      .values({ name: "T", status: "playoff", configJson: {} })
      .returning();
    await testDb.insert(players).values({
      tournamentId: t!.id,
      name: "Honza",
      competitorId: c!.id,
      eloRating: 1640,
    });

    await finalizeTournamentRatings(testDb, t!.id);

    const [after] = await testDb
      .select()
      .from(competitors)
      .where(eq(competitors.id, c!.id));
    expect(after!.eloRating).toBe(1640);
  });
});
