import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, truncateAll, teardownTestDb, testDb } from "../setup/db";
import { tournaments, players, matches, legs } from "@/db/schema";
import { TournamentService } from "@/lib/tournament";
import { PlayerService } from "@/lib/player";
import { defaultTournamentConfig } from "@/lib/tournament-config";
import { LegService } from "@/lib/leg";

const tournamentService = new TournamentService(testDb);
const playerService = new PlayerService(testDb);
const legService = new LegService(testDb);

beforeAll(async () => {
  await setupTestDb();
});
beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await teardownTestDb();
});

async function setupMatch(bestOf = 3) {
  const t = await tournamentService.create({ name: "T", config: defaultTournamentConfig() });
  const gs = await playerService.ensureGroups(t.id, 1);
  const p1 = await playerService.add(t.id, "A");
  const p2 = await playerService.add(t.id, "B");
  await playerService.assignToGroup(p1.id, gs[0]!.id);
  await playerService.assignToGroup(p2.id, gs[0]!.id);
  const [m] = await testDb
    .insert(matches)
    .values({
      tournamentId: t.id,
      phase: "group",
      groupId: gs[0]!.id,
      playerAId: p1.id,
      playerBId: p2.id,
      bestOf,
      status: "scheduled",
    })
    .returning();
  return { tournament: t, match: m!, players: [p1, p2] as const };
}

describe("LegService", () => {
  it("startLeg creates leg 1 and flips match to live", async () => {
    const { match } = await setupMatch();
    const leg = await legService.startLeg(match.id);
    expect(leg.legNumber).toBe(1);
    expect(leg.status).toBe("live");
    const [m] = await testDb.select().from(matches).where(eq(matches.id, match.id));
    expect(m?.status).toBe("live");
  });

  it("rejects starting a second leg while one is live", async () => {
    const { match } = await setupMatch();
    await legService.startLeg(match.id);
    await expect(legService.startLeg(match.id)).rejects.toThrow(/already live/i);
  });

  it("recordLeg increments score and lets you start the next leg", async () => {
    const { match, players: [a] } = await setupMatch();
    const leg1 = await legService.startLeg(match.id);
    const r = await legService.recordLeg(leg1.id, a.id);
    expect(r.match.scoreA).toBe(1);
    expect(r.match.scoreB).toBe(0);
    expect(r.match.status).toBe("live");
    const leg2 = await legService.startLeg(match.id);
    expect(leg2.legNumber).toBe(2);
  });

  it("recordLeg finalizes match when winning score reached (best-of-3, first to 2)", async () => {
    const { match, players: [a] } = await setupMatch(3);
    const leg1 = await legService.startLeg(match.id);
    await legService.recordLeg(leg1.id, a.id);
    const leg2 = await legService.startLeg(match.id);
    const r = await legService.recordLeg(leg2.id, a.id);
    expect(r.match.status).toBe("finished");
    expect(r.match.winnerId).toBe(a.id);
    expect(r.match.scoreA).toBe(2);
    expect(r.match.scoreB).toBe(0);
  });

  it("recordLeg rejects winner not in the match", async () => {
    const { match } = await setupMatch();
    const leg = await legService.startLeg(match.id);
    await expect(
      legService.recordLeg(leg.id, "00000000-0000-0000-0000-000000000000")
    ).rejects.toThrow(/winner must be/i);
  });

  it("recordLeg fails on a non-live leg", async () => {
    const { match, players: [a] } = await setupMatch();
    const leg = await legService.startLeg(match.id);
    await legService.recordLeg(leg.id, a.id);
    await expect(legService.recordLeg(leg.id, a.id)).rejects.toThrow(/not live/i);
  });

  it("cancelMatch marks match cancelled and finishes any live leg", async () => {
    const { match } = await setupMatch();
    await legService.startLeg(match.id);
    await legService.cancelMatch(match.id);
    const [m] = await testDb.select().from(matches).where(eq(matches.id, match.id));
    expect(m?.status).toBe("cancelled");
    const ls = await testDb.select().from(legs).where(eq(legs.matchId, match.id));
    expect(ls.every((l) => l.status === "finished")).toBe(true);
  });
});
