import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, truncateAll, teardownTestDb, testDb } from "../setup/db";
import { matches, players } from "@/db/schema";
import { TournamentService } from "@/lib/tournament";
import { PlayerService } from "@/lib/player";
import { defaultTournamentConfig } from "@/lib/tournament-config";
import { recordLegAndAdvance, startLegWithMarkets } from "@/lib/leg";

const tournamentService = new TournamentService(testDb);
const playerService = new PlayerService(testDb);

beforeAll(async () => {
  await setupTestDb();
});
beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await teardownTestDb();
});

describe("ELO update after a finished match", () => {
  it("winner ELO goes up, loser ELO goes down (best-of-3 swept)", async () => {
    const t = await tournamentService.create({
      name: "T",
      config: defaultTournamentConfig(),
    });
    const gs = await playerService.ensureGroups(t.id, 1);
    const pA = await playerService.add(t.id, "A");
    const pB = await playerService.add(t.id, "B");
    await playerService.assignToGroup(pA.id, gs[0]!.id);
    await playerService.assignToGroup(pB.id, gs[0]!.id);
    const [m] = await testDb
      .insert(matches)
      .values({
        tournamentId: t.id,
        phase: "group",
        groupId: gs[0]!.id,
        playerAId: pA.id,
        playerBId: pB.id,
        bestOf: 3,
        status: "scheduled",
      })
      .returning();

    const leg1 = await startLegWithMarkets(m!.id);
    await recordLegAndAdvance(leg1.id, pA.id);
    const leg2 = await startLegWithMarkets(m!.id);
    await recordLegAndAdvance(leg2.id, pA.id);

    const [updatedA] = await testDb.select().from(players).where(eq(players.id, pA.id));
    const [updatedB] = await testDb.select().from(players).where(eq(players.id, pB.id));
    expect(updatedA?.eloRating).toBeGreaterThan(1500);
    expect(updatedB?.eloRating).toBeLessThan(1500);
    expect((updatedA!.eloRating - 1500) + (updatedB!.eloRating - 1500)).toBeLessThanOrEqual(1);
  });
});
