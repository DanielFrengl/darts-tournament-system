import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, truncateAll, teardownTestDb, testDb } from "../setup/db";
import { competitors, matches, players, tournaments } from "@/db/schema";
import { createUser } from "../setup/factories";
import { TournamentService } from "@/lib/tournament";
import { PlayerService } from "@/lib/player";
import { MarketService } from "@/lib/market";
import { resyncPlayerRatings } from "@/lib/competitor";
import { defaultTournamentConfig } from "@/lib/tournament-config";

const tournamentService = new TournamentService(testDb);
const playerService = new PlayerService(testDb);
const marketService = new MarketService(testDb);

beforeAll(async () => {
  await setupTestDb();
});
beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await teardownTestDb();
});

async function draftTournament() {
  return tournamentService.create({
    name: "T",
    config: defaultTournamentConfig(),
  });
}

async function competitor(displayName: string, eloRating: number, userId?: string) {
  const [c] = await testDb
    .insert(competitors)
    .values({ displayName, eloRating, userId: userId ?? null })
    .returning();
  return c!;
}

describe("PlayerService rating seeding", () => {
  it("add carries the rating of the competitor with the same name", async () => {
    await competitor("Honza", 1712);
    const t = await draftTournament();

    const p = await playerService.add(t.id, "Honza");

    expect(p.eloRating).toBe(1712);
    expect(p.competitorId).not.toBeNull();
  });

  it("add mints a competitor at 1500 for a name nobody has played under", async () => {
    const t = await draftTournament();

    const p = await playerService.add(t.id, "Nováček");

    expect(p.eloRating).toBe(1500);
    const [c] = await testDb
      .select()
      .from(competitors)
      .where(eq(competitors.id, p.competitorId!));
    expect(c!.displayName).toBe("Nováček");
    expect(c!.eloRating).toBe(1500);
  });

  it("add keeps an offline player account-less even when the name is linked", async () => {
    const u = await createUser();
    await competitor("Honza", 1712, u.id);
    const t = await draftTournament();

    const p = await playerService.add(t.id, "Honza");

    expect(p.eloRating).toBe(1712);
    expect(p.userId).toBeNull();
  });

  it("addFromUser carries the rating of the account's competitor", async () => {
    const u = await createUser({ firstName: "Jan", lastName: "Novák" });
    const c = await competitor("Jan Novák", 1648, u.id);
    const t = await draftTournament();

    const p = await playerService.addFromUser(t.id, u.id);

    expect(p.eloRating).toBe(1648);
    expect(p.competitorId).toBe(c.id);
  });

  it("addFromUser adopts an unlinked competitor of the same name and links it", async () => {
    // The row the history importer creates: real rating, no account yet.
    const c = await competitor("Jan Novák", 1590);
    const u = await createUser({ firstName: "Jan", lastName: "Novák" });
    const t = await draftTournament();

    const p = await playerService.addFromUser(t.id, u.id);

    expect(p.eloRating).toBe(1590);
    expect(p.competitorId).toBe(c.id);
    const [linked] = await testDb
      .select()
      .from(competitors)
      .where(eq(competitors.id, c.id));
    expect(linked!.userId).toBe(u.id);
  });

  it("addFromUser never claims a competitor belonging to someone else", async () => {
    const owner = await createUser({ firstName: "Jan", lastName: "Novák" });
    const c = await competitor("Jan Novák", 1800, owner.id);
    const other = await createUser({ firstName: "Jan", lastName: "Novák" });
    const t = await draftTournament();

    const p = await playerService.addFromUser(t.id, other.id);

    expect(p.competitorId).not.toBe(c.id);
    expect(p.eloRating).toBe(1500);
    const [untouched] = await testDb
      .select()
      .from(competitors)
      .where(eq(competitors.id, c.id));
    expect(untouched!.userId).toBe(owner.id);
  });

  it("prices a mismatched pairing away from an even 2.00", async () => {
    // The bug this guards: players created without a competitor all sat at
    // the 1500 default, so every pairing modelled as a coin flip and the
    // whole board opened at kurz 2.00.
    await competitor("Silný", 1800);
    await competitor("Slabý", 1300);
    const t = await draftTournament();
    const strong = await playerService.add(t.id, "Silný");
    const weak = await playerService.add(t.id, "Slabý");
    const [m] = await testDb
      .insert(matches)
      .values({
        tournamentId: t.id,
        phase: "group",
        playerAId: strong.id,
        playerBId: weak.id,
        bestOf: 3,
        status: "scheduled",
      })
      .returning();

    await marketService.createForMatch(m!.id);

    const mw = (await marketService.listByMatch(m!.id)).find(
      (x) => x.type === "match_winner"
    )!;
    const sels = await marketService.getSelections(mw.id);
    const favourite = sels.find((s) => s.playerId === strong.id)!;
    const outsider = sels.find((s) => s.playerId === weak.id)!;
    expect(Number(favourite.finalOdds)).toBeLessThan(1.5);
    expect(Number(outsider.finalOdds)).toBeGreaterThan(2.5);
  });
});

describe("resyncPlayerRatings", () => {
  /** A tournament in the broken state: real competitors, flat players. */
  async function flatTournament() {
    const t = await tournamentService.create({
      name: "T",
      config: defaultTournamentConfig(),
    });
    await testDb
      .update(tournaments)
      .set({ status: "groups" })
      .where(eq(tournaments.id, t.id));
    const strong = await competitor("Silný", 1800);
    const weak = await competitor("Slabý", 1300);
    const [pStrong] = await testDb
      .insert(players)
      .values({ tournamentId: t.id, name: "Silný" })
      .returning();
    const [pWeak] = await testDb
      .insert(players)
      .values({ tournamentId: t.id, name: "Slabý" })
      .returning();
    return { t, strong, weak, pStrong: pStrong!, pWeak: pWeak! };
  }

  it("links players to their competitors and pulls the carried rating in", async () => {
    const { t, strong, weak, pStrong, pWeak } = await flatTournament();
    expect(pStrong.eloRating).toBe(1500);
    expect(pStrong.competitorId).toBeNull();

    const r = await resyncPlayerRatings(testDb, t.id);

    expect(r.players).toBe(2);
    expect(r.linked).toBe(2);
    const [a] = await testDb.select().from(players).where(eq(players.id, pStrong.id));
    const [b] = await testDb.select().from(players).where(eq(players.id, pWeak.id));
    expect(a!.eloRating).toBe(1800);
    expect(a!.competitorId).toBe(strong.id);
    expect(b!.eloRating).toBe(1300);
    expect(b!.competitorId).toBe(weak.id);
  });

  it("replays finished matches so in-tournament drift survives the repair", async () => {
    const { t, pStrong, pWeak } = await flatTournament();
    // The outsider already beat the favourite in this tournament.
    await testDb.insert(matches).values({
      tournamentId: t.id,
      phase: "group",
      playerAId: pStrong.id,
      playerBId: pWeak.id,
      bestOf: 3,
      status: "finished",
      winnerId: pWeak.id,
      scoreA: 0,
      scoreB: 2,
      finishedAt: new Date(),
    });

    const r = await resyncPlayerRatings(testDb, t.id);

    expect(r.replayed).toBe(1);
    const [a] = await testDb.select().from(players).where(eq(players.id, pStrong.id));
    const [b] = await testDb.select().from(players).where(eq(players.id, pWeak.id));
    // Baselines were 1800 / 1300; the upset moves them toward each other.
    expect(a!.eloRating).toBeLessThan(1800);
    expect(b!.eloRating).toBeGreaterThan(1300);
    expect(a!.eloRating).toBeGreaterThan(b!.eloRating);
  });

  it("writes the replayed rating even when it lands back on the stale value", async () => {
    // Two evenly matched players whose stale rows already read 1500: the
    // replay must still push them off that value, not skip the write because
    // the old row happened to match.
    const t = await tournamentService.create({
      name: "T",
      config: defaultTournamentConfig(),
    });
    await testDb
      .update(tournaments)
      .set({ status: "groups" })
      .where(eq(tournaments.id, t.id));
    await competitor("Rovný", 1500);
    await competitor("Druhý", 1500);
    const [p1] = await testDb
      .insert(players)
      .values({ tournamentId: t.id, name: "Rovný" })
      .returning();
    const [p2] = await testDb
      .insert(players)
      .values({ tournamentId: t.id, name: "Druhý" })
      .returning();
    await testDb.insert(matches).values({
      tournamentId: t.id,
      phase: "group",
      playerAId: p1!.id,
      playerBId: p2!.id,
      bestOf: 3,
      status: "finished",
      winnerId: p1!.id,
      scoreA: 2,
      scoreB: 0,
      finishedAt: new Date(),
    });

    await resyncPlayerRatings(testDb, t.id);

    const [a] = await testDb.select().from(players).where(eq(players.id, p1!.id));
    const [b] = await testDb.select().from(players).where(eq(players.id, p2!.id));
    expect(a!.eloRating).toBeGreaterThan(1500);
    expect(b!.eloRating).toBeLessThan(1500);
  });

  it("repriceOpenMarkets moves an open book off the flat 2.00", async () => {
    const { t, pStrong, pWeak } = await flatTournament();
    const [m] = await testDb
      .insert(matches)
      .values({
        tournamentId: t.id,
        phase: "group",
        playerAId: pStrong.id,
        playerBId: pWeak.id,
        bestOf: 3,
        status: "scheduled",
      })
      .returning();
    await marketService.createForMatch(m!.id);
    const mw = (await marketService.listByMatch(m!.id)).find(
      (x) => x.type === "match_winner"
    )!;
    const before = await marketService.getSelections(mw.id);
    // Every player at 1500: the symptom, reproduced.
    expect(before.every((s) => Number(s.finalOdds) === 2)).toBe(true);

    await resyncPlayerRatings(testDb, t.id);
    const repriced = await marketService.repriceOpenMarkets(t.id);

    expect(repriced).toBeGreaterThan(0);
    const after = await marketService.getSelections(mw.id);
    const favourite = after.find((s) => s.playerId === pStrong.id)!;
    const outsider = after.find((s) => s.playerId === pWeak.id)!;
    expect(Number(favourite.finalOdds)).toBeLessThan(1.5);
    expect(Number(outsider.finalOdds)).toBeGreaterThan(2.5);
    // Selections are updated in place, so bets keep pointing at them.
    expect(after.map((s) => s.id).sort()).toEqual(before.map((s) => s.id).sort());
  });

  it("refuses on a finished tournament, whose ratings are already written back", async () => {
    const { t } = await flatTournament();
    await testDb
      .update(tournaments)
      .set({ status: "finished" })
      .where(eq(tournaments.id, t.id));

    await expect(resyncPlayerRatings(testDb, t.id)).rejects.toThrow(/dohran/i);
  });
});
