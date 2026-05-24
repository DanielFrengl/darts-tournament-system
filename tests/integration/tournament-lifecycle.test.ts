import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, truncateAll, teardownTestDb, testDb } from "../setup/db";
import { tournaments } from "@/db/schema";
import { TournamentService } from "@/lib/tournament";
import { defaultTournamentConfig } from "@/lib/tournament-config";

const service = new TournamentService(testDb);

beforeAll(async () => {
  await setupTestDb();
});
beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await teardownTestDb();
});

describe("TournamentService", () => {
  it("create inserts a draft tournament with config", async () => {
    const t = await service.create({ name: "Spring Cup", config: defaultTournamentConfig() });
    expect(t.id).toBeTypeOf("string");
    expect(t.status).toBe("draft");
    expect(t.name).toBe("Spring Cup");
    const [row] = await testDb.select().from(tournaments).where(eq(tournaments.id, t.id));
    expect(row?.configJson).toMatchObject({ groupCount: 2, groupSize: 4 });
  });

  it("create rejects invalid config", async () => {
    await expect(
      service.create({
        name: "Bad",
        config: { ...defaultTournamentConfig(), groupCount: 0 } as never,
      })
    ).rejects.toThrow();
  });

  it("updateConfig works in draft", async () => {
    const t = await service.create({ name: "T", config: defaultTournamentConfig() });
    const newCfg = { ...defaultTournamentConfig(), startingCapital: 5000 };
    await service.updateConfig(t.id, newCfg);
    const reloaded = await service.get(t.id);
    expect(reloaded?.configJson.startingCapital).toBe(5000);
  });

  it("updateConfig rejects after groups started", async () => {
    const t = await service.create({ name: "T", config: defaultTournamentConfig() });
    await testDb.update(tournaments).set({ status: "groups" }).where(eq(tournaments.id, t.id));
    await expect(
      service.updateConfig(t.id, defaultTournamentConfig())
    ).rejects.toThrow(/draft/i);
  });

  it("transition draft → groups", async () => {
    const t = await service.create({ name: "T", config: defaultTournamentConfig() });
    await service.transition(t.id, "groups");
    const reloaded = await service.get(t.id);
    expect(reloaded?.status).toBe("groups");
    expect(reloaded?.startedAt).not.toBeNull();
  });

  it("transition rejects invalid state changes", async () => {
    const t = await service.create({ name: "T", config: defaultTournamentConfig() });
    await expect(service.transition(t.id, "finished")).rejects.toThrow(/invalid transition/i);
  });

  it("list returns tournaments in reverse chronological order", async () => {
    await service.create({ name: "First", config: defaultTournamentConfig() });
    await new Promise((r) => setTimeout(r, 5));
    await service.create({ name: "Second", config: defaultTournamentConfig() });
    const list = await service.list();
    expect(list).toHaveLength(2);
    expect(list[0]?.name).toBe("Second");
  });

  it("getActive returns the most recent non-finished tournament", async () => {
    const t1 = await service.create({ name: "Old", config: defaultTournamentConfig() });
    await testDb
      .update(tournaments)
      .set({ status: "finished" })
      .where(eq(tournaments.id, t1.id));
    const t2 = await service.create({ name: "Current", config: defaultTournamentConfig() });
    const active = await service.getActive();
    expect(active?.id).toBe(t2.id);
  });

  it("getActive returns null when no active tournament", async () => {
    const active = await service.getActive();
    expect(active).toBeNull();
  });
});
