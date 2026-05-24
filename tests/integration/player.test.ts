import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, truncateAll, teardownTestDb, testDb } from "../setup/db";
import { tournaments, players } from "@/db/schema";
import { TournamentService } from "@/lib/tournament";
import { PlayerService } from "@/lib/player";
import { defaultTournamentConfig } from "@/lib/tournament-config";

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

describe("PlayerService", () => {
  it("add inserts a player tied to the tournament", async () => {
    const t = await tournamentService.create({
      name: "T",
      config: defaultTournamentConfig(),
    });
    const p = await playerService.add(t.id, "Karel");
    expect(p.name).toBe("Karel");
    expect(p.tournamentId).toBe(t.id);
    const list = await playerService.list(t.id);
    expect(list).toHaveLength(1);
  });

  it("add rejects after tournament leaves draft", async () => {
    const t = await tournamentService.create({
      name: "T",
      config: defaultTournamentConfig(),
    });
    await testDb.update(tournaments).set({ status: "groups" }).where(eq(tournaments.id, t.id));
    await expect(playerService.add(t.id, "Late")).rejects.toThrow(/draft/i);
  });

  it("remove deletes player when in draft", async () => {
    const t = await tournamentService.create({
      name: "T",
      config: defaultTournamentConfig(),
    });
    const p = await playerService.add(t.id, "Karel");
    await playerService.remove(p.id);
    const list = await playerService.list(t.id);
    expect(list).toHaveLength(0);
  });

  it("ensureGroups creates groups A, B, ... for the configured count", async () => {
    const t = await tournamentService.create({
      name: "T",
      config: defaultTournamentConfig(),
    });
    const gs = await playerService.ensureGroups(t.id, 2);
    expect(gs).toHaveLength(2);
    expect(gs.map((g) => g.name)).toEqual(["A", "B"]);
  });

  it("ensureGroups is idempotent", async () => {
    const t = await tournamentService.create({
      name: "T",
      config: defaultTournamentConfig(),
    });
    await playerService.ensureGroups(t.id, 2);
    const gs = await playerService.ensureGroups(t.id, 2);
    expect(gs).toHaveLength(2);
  });

  it("assignToGroup assigns and reassigns", async () => {
    const t = await tournamentService.create({
      name: "T",
      config: defaultTournamentConfig(),
    });
    const gs = await playerService.ensureGroups(t.id, 2);
    const p = await playerService.add(t.id, "Karel");
    await playerService.assignToGroup(p.id, gs[0]!.id);
    const [reloaded] = await testDb.select().from(players).where(eq(players.id, p.id));
    expect(reloaded?.groupId).toBe(gs[0]!.id);
    await playerService.assignToGroup(p.id, gs[1]!.id);
    const [reloaded2] = await testDb.select().from(players).where(eq(players.id, p.id));
    expect(reloaded2?.groupId).toBe(gs[1]!.id);
  });

  it("assignToGroup rejects group from another tournament", async () => {
    const t1 = await tournamentService.create({
      name: "T1",
      config: defaultTournamentConfig(),
    });
    const t2 = await tournamentService.create({
      name: "T2",
      config: defaultTournamentConfig(),
    });
    const gs2 = await playerService.ensureGroups(t2.id, 1);
    const p = await playerService.add(t1.id, "Karel");
    await expect(playerService.assignToGroup(p.id, gs2[0]!.id)).rejects.toThrow();
  });

  it("autoAssignRandom assigns players round-robin across groups", async () => {
    const t = await tournamentService.create({
      name: "T",
      config: defaultTournamentConfig(),
    });
    for (const n of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
      await playerService.add(t.id, n);
    }
    await playerService.autoAssignRandom(t.id);
    const byGroup = await playerService.listByGroup(t.id);
    const groupSizes = [...byGroup.values()].map((arr) => arr.length).sort();
    expect(groupSizes).toEqual([4, 4]);
    expect(byGroup.get(null)?.length ?? 0).toBe(0);
  });

  it("countUnassigned returns players without group", async () => {
    const t = await tournamentService.create({
      name: "T",
      config: defaultTournamentConfig(),
    });
    await playerService.add(t.id, "A");
    await playerService.add(t.id, "B");
    expect(await playerService.countUnassigned(t.id)).toBe(2);
  });
});
