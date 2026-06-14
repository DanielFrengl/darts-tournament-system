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
import { competitors, players, tournaments, users } from "@/db/schema";
import {
  addPlayerFromCompetitor,
  addNewcomer,
  finalizeTournamentRatings,
  linkCompetitorToUser,
  setCompetitorElo,
  unlockCompetitorElo,
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

  it("links a competitor to a user and propagates to active players", async () => {
    const [u] = await testDb
      .insert(users)
      .values({ email: "h@x.cz", username: "honza", passwordHash: "x" })
      .returning();
    const [c] = await testDb
      .insert(competitors)
      .values({ displayName: "Honza", eloRating: 1600 })
      .returning();
    const [t] = await testDb
      .insert(tournaments)
      .values({ name: "T", status: "groups", configJson: {} })
      .returning();
    const [p] = await testDb
      .insert(players)
      .values({ tournamentId: t!.id, name: "Honza", competitorId: c!.id })
      .returning();

    await linkCompetitorToUser(testDb, c!.id, u!.id);

    const [c2] = await testDb
      .select()
      .from(competitors)
      .where(eq(competitors.id, c!.id));
    const [p2] = await testDb.select().from(players).where(eq(players.id, p!.id));
    expect(c2!.userId).toBe(u!.id);
    expect(p2!.userId).toBe(u!.id);
  });

  it("sets and locks elo, then unlocks", async () => {
    const [c] = await testDb
      .insert(competitors)
      .values({ displayName: "X", eloRating: 1500 })
      .returning();

    await setCompetitorElo(testDb, c!.id, 1700);
    let [r] = await testDb
      .select()
      .from(competitors)
      .where(eq(competitors.id, c!.id));
    expect(r!.eloRating).toBe(1700);
    expect(r!.eloLocked).toBe(true);

    await unlockCompetitorElo(testDb, c!.id);
    [r] = await testDb
      .select()
      .from(competitors)
      .where(eq(competitors.id, c!.id));
    expect(r!.eloLocked).toBe(false);
  });
});
