import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, truncateAll, teardownTestDb, testDb } from "../setup/db";
import { bets, legs, matches, tournaments, users } from "@/db/schema";
import { createUser } from "../setup/factories";
import { TournamentService } from "@/lib/tournament";
import { PlayerService } from "@/lib/player";
import { MarketService } from "@/lib/market";
import { CapitalService } from "@/lib/capital";
import { BettingService } from "@/lib/betting";
import {
  restoreMatch,
  setMatchBestOf,
  setPhaseBestOf,
} from "@/lib/match-lifecycle";
import {
  cancelMatchWithMarkets,
  recordLegAndAdvance,
  startLegWithMarkets,
} from "@/lib/leg";
import { defaultTournamentConfig } from "@/lib/tournament-config";

const tournamentService = new TournamentService(testDb);
const playerService = new PlayerService(testDb);
const marketService = new MarketService(testDb);
const bettingService = new BettingService(
  testDb,
  new CapitalService(testDb),
  marketService
);

beforeAll(async () => {
  await setupTestDb();
});
beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await teardownTestDb();
});

async function playoffTournament() {
  const t = await tournamentService.create({
    name: "T",
    config: defaultTournamentConfig(),
  });
  const a = await playerService.add(t.id, "A");
  const b = await playerService.add(t.id, "B");
  await testDb
    .update(tournaments)
    .set({ status: "playoff" })
    .where(eq(tournaments.id, t.id));
  return { t, a, b };
}

async function addMatch(
  tournamentId: string,
  playerAId: string,
  playerBId: string,
  phase: "group" | "quarter" | "semi" | "third_place" | "final",
  bestOf: number,
  status: "scheduled" | "live" = "scheduled"
) {
  const [m] = await testDb
    .insert(matches)
    .values({
      tournamentId,
      phase,
      bracketRound: 1,
      bracketPosition: 0,
      playerAId,
      playerBId,
      bestOf,
      status,
    })
    .returning();
  return m!;
}

function scoresOf(sels: { scoreA: number | null; scoreB: number | null }[]) {
  return sels.map((s) => `${s.scoreA}:${s.scoreB}`).sort();
}

async function correctScoreSelections(matchId: string) {
  const cs = (await marketService.listByMatch(matchId)).find(
    (m) => m.type === "correct_score" && m.status !== "cancelled"
  )!;
  return marketService.getSelections(cs.id);
}

describe("setMatchBestOf", () => {
  it("rebuilds the correct-score book for the new length", async () => {
    const { t, a, b } = await playoffTournament();
    const m = await addMatch(t.id, a.id, b.id, "semi", 5);
    await marketService.createForMatch(m.id);
    expect(scoresOf(await correctScoreSelections(m.id))).toEqual([
      "0:3",
      "1:3",
      "2:3",
      "3:0",
      "3:1",
      "3:2",
    ]);

    const r = await setMatchBestOf(m.id, 7);

    expect(r.changed).toBe(true);
    const [reloaded] = await testDb
      .select()
      .from(matches)
      .where(eq(matches.id, m.id));
    expect(reloaded!.bestOf).toBe(7);
    expect(scoresOf(await correctScoreSelections(m.id))).toEqual([
      "0:4",
      "1:4",
      "2:4",
      "3:4",
      "4:0",
      "4:1",
      "4:2",
      "4:3",
    ]);
  });

  it("leaves exactly one live book behind", async () => {
    const { t, a, b } = await playoffTournament();
    const m = await addMatch(t.id, a.id, b.id, "semi", 5);
    await marketService.createForMatch(m.id);

    await setMatchBestOf(m.id, 7);

    const live = (await marketService.listByMatch(m.id)).filter(
      (x) => x.status !== "cancelled"
    );
    expect(live.map((x) => x.type).sort()).toEqual([
      "correct_score",
      "match_winner",
    ]);
  });

  it("refunds bets standing on the book it voids", async () => {
    const { t, a, b } = await playoffTournament();
    const m = await addMatch(t.id, a.id, b.id, "semi", 5);
    await marketService.createForMatch(m.id);
    const cs = (await marketService.listByMatch(m.id)).find(
      (x) => x.type === "correct_score"
    )!;
    const sel = (await marketService.getSelections(cs.id))[0]!;
    const u = await createUser({ capital: "1000" });
    const placed = await bettingService.placeBet(u.id, sel.id, 100);
    expect(placed.ok).toBe(true);

    const r = await setMatchBestOf(m.id, 7);

    expect(r.refunded).toBe(1);
    if (!placed.ok) return;
    const [settled] = await testDb
      .select()
      .from(bets)
      .where(eq(bets.id, placed.bet.id));
    expect(settled!.status).toBe("refunded");
    const [user] = await testDb.select().from(users).where(eq(users.id, u.id));
    expect(Number(user!.capital)).toBe(1000);
  });

  it("is a no-op when the length is unchanged", async () => {
    const { t, a, b } = await playoffTournament();
    const m = await addMatch(t.id, a.id, b.id, "semi", 5);
    await marketService.createForMatch(m.id);

    const r = await setMatchBestOf(m.id, 5);

    expect(r).toEqual({ changed: false, refunded: 0 });
    const all = await marketService.listByMatch(m.id);
    expect(all.every((x) => x.status === "open")).toBe(true);
  });

  it("rejects an even length", async () => {
    const { t, a, b } = await playoffTournament();
    const m = await addMatch(t.id, a.id, b.id, "semi", 5);
    await expect(setMatchBestOf(m.id, 6)).rejects.toThrow(/lich/i);
  });

  it("rejects a match that has already started", async () => {
    const { t, a, b } = await playoffTournament();
    const m = await addMatch(t.id, a.id, b.id, "semi", 5, "live");
    await testDb
      .insert(legs)
      .values({ matchId: m.id, legNumber: 1, status: "live" });

    await expect(setMatchBestOf(m.id, 7)).rejects.toThrow(/nezahájen/i);
  });
});

describe("restoring a match whose length was changed", () => {
  it("brings back the current book, not the one the change superseded", async () => {
    const { t, a, b } = await playoffTournament();
    const m = await addMatch(t.id, a.id, b.id, "semi", 5);
    await marketService.createForMatch(m.id);
    await setMatchBestOf(m.id, 7);

    await cancelMatchWithMarkets(m.id);
    await restoreMatch(m.id);

    const open = (await marketService.listByMatch(m.id)).filter(
      (x) => x.status === "open"
    );
    expect(open.map((x) => x.type).sort()).toEqual([
      "correct_score",
      "match_winner",
    ]);
    // The reopened correct-score book is the best-of-7 one.
    expect(scoresOf(await correctScoreSelections(m.id))).toContain("4:3");
  });

  it("still reopens a plain cancellation", async () => {
    const { t, a, b } = await playoffTournament();
    const m = await addMatch(t.id, a.id, b.id, "semi", 5);
    await marketService.createForMatch(m.id);

    await cancelMatchWithMarkets(m.id);
    await restoreMatch(m.id);

    const open = (await marketService.listByMatch(m.id)).filter(
      (x) => x.status === "open"
    );
    expect(open).toHaveLength(2);
  });
});

describe("setPhaseBestOf", () => {
  it("stores the new length so a round drawn later picks it up", async () => {
    const { t } = await playoffTournament();

    await setPhaseBestOf(t.id, "semi", 9);

    const reloaded = await tournamentService.get(t.id);
    expect(reloaded!.configJson.bestOfSemi).toBe(9);
  });

  it("also rewrites the round's matches that are already drawn", async () => {
    const { t, a, b } = await playoffTournament();
    const m = await addMatch(t.id, a.id, b.id, "semi", 5);
    await marketService.createForMatch(m.id);

    const r = await setPhaseBestOf(t.id, "semi", 7);

    expect(r.updated).toBe(1);
    const [reloaded] = await testDb
      .select()
      .from(matches)
      .where(eq(matches.id, m.id));
    expect(reloaded!.bestOf).toBe(7);
  });

  it("carries the semi length onto the third-place play-off", async () => {
    const { t, a, b } = await playoffTournament();
    const third = await addMatch(t.id, a.id, b.id, "third_place", 5);

    await setPhaseBestOf(t.id, "semi", 7);

    const [reloaded] = await testDb
      .select()
      .from(matches)
      .where(eq(matches.id, third.id));
    expect(reloaded!.bestOf).toBe(7);
  });

  it("leaves a match that is already under way at the length it started", async () => {
    const { t, a, b } = await playoffTournament();
    const live = await addMatch(t.id, a.id, b.id, "semi", 5, "live");

    const r = await setPhaseBestOf(t.id, "semi", 7);

    expect(r.skipped).toBe(1);
    expect(r.updated).toBe(0);
    const [reloaded] = await testDb
      .select()
      .from(matches)
      .where(eq(matches.id, live.id));
    expect(reloaded!.bestOf).toBe(5);
  });

  it("touches only the round it names", async () => {
    const { t, a, b } = await playoffTournament();
    const final = await addMatch(t.id, a.id, b.id, "final", 7);

    await setPhaseBestOf(t.id, "semi", 9);

    const [reloaded] = await testDb
      .select()
      .from(matches)
      .where(eq(matches.id, final.id));
    expect(reloaded!.bestOf).toBe(7);
    const cfg = await tournamentService.get(t.id);
    expect(cfg!.configJson.bestOfFinal).toBe(7);
  });

  it("refuses on a finished tournament", async () => {
    const { t } = await playoffTournament();
    await testDb
      .update(tournaments)
      .set({ status: "finished" })
      .where(eq(tournaments.id, t.id));

    await expect(setPhaseBestOf(t.id, "semi", 7)).rejects.toThrow(/dohran/i);
  });
});

describe("restoring a match that was already being played", () => {
  /** Play `recorded` legs, leave one running, then cancel the match. */
  async function cancelledMidMatch(recorded: number, bestOf = 5) {
    const { t, a, b } = await playoffTournament();
    const m = await addMatch(t.id, a.id, b.id, "semi", bestOf);
    await marketService.createForMatch(m.id);
    for (let i = 0; i < recorded; i++) {
      const leg = await startLegWithMarkets(m.id);
      await recordLegAndAdvance(leg.id, a.id);
    }
    const running = await startLegWithMarkets(m.id);
    await cancelMatchWithMarkets(m.id);
    return { t, a, b, match: m, runningLeg: running };
  }

  it("comes back live, keeping the legs that were actually played", async () => {
    const { a, match } = await cancelledMidMatch(2);

    const r = await restoreMatch(match.id);

    expect(r.status).toBe("live");
    expect(r.scoreA).toBe(2);
    expect(r.scoreB).toBe(0);
    const [reloaded] = await testDb
      .select()
      .from(matches)
      .where(eq(matches.id, match.id));
    expect(reloaded!.status).toBe("live");
    expect(reloaded!.scoreA).toBe(2);
    expect(reloaded!.winnerId).toBeNull();
    expect(reloaded!.finishedAt).toBeNull();
    void a;
  });

  it("hands the interrupted leg back to the scorer as live", async () => {
    const { match, runningLeg } = await cancelledMidMatch(1);

    const r = await restoreMatch(match.id);

    expect(r.resumedLeg).toBe(2);
    const [leg] = await testDb
      .select()
      .from(legs)
      .where(eq(legs.id, runningLeg.id));
    expect(leg!.status).toBe("live");
    expect(leg!.winnerId).toBeNull();
    expect(leg!.finishedAt).toBeNull();
  });

  it("leaves the played legs settled — their payouts were never taken back", async () => {
    const { match } = await cancelledMidMatch(2);

    await restoreMatch(match.id);

    const all = await marketService.listByMatch(match.id);
    const legMarkets = all.filter((x) => x.type === "leg_winner");
    const settled = legMarkets.filter((x) => x.status === "settled");
    const open = legMarkets.filter((x) => x.status === "open");
    expect(settled).toHaveLength(2); // the two recorded legs
    expect(open).toHaveLength(1); // the interrupted one, refunded and reopened
  });

  it("keeps pre-match betting shut, because the match had already started", async () => {
    const { match } = await cancelledMidMatch(1);

    await restoreMatch(match.id);

    const all = await marketService.listByMatch(match.id);
    for (const type of ["match_winner", "correct_score"]) {
      const mk = all.find((x) => x.type === type)!;
      expect(mk.status).toBe("closed");
    }
  });

  it("still restores a never-started match straight to scheduled and open", async () => {
    const { t, a, b } = await playoffTournament();
    const m = await addMatch(t.id, a.id, b.id, "semi", 5);
    await marketService.createForMatch(m.id);
    await cancelMatchWithMarkets(m.id);

    const r = await restoreMatch(m.id);

    expect(r.status).toBe("scheduled");
    expect(r.resumedLeg).toBeNull();
    const all = await marketService.listByMatch(m.id);
    expect(all.filter((x) => x.status === "open")).toHaveLength(2);
  });

  it("comes back finished when the recorded legs already decide it", async () => {
    // bo3, both legs to A: the match was over when it was cancelled.
    const { t, a, b } = await playoffTournament();
    const m = await addMatch(t.id, a.id, b.id, "semi", 3);
    await marketService.createForMatch(m.id);
    for (let i = 0; i < 2; i++) {
      const leg = await startLegWithMarkets(m.id);
      await recordLegAndAdvance(leg.id, a.id);
    }
    await cancelMatchWithMarkets(m.id);

    const r = await restoreMatch(m.id);

    expect(r.status).toBe("finished");
    expect(r.scoreA).toBe(2);
    const [reloaded] = await testDb
      .select()
      .from(matches)
      .where(eq(matches.id, m.id));
    expect(reloaded!.winnerId).toBe(a.id);
    expect(reloaded!.finishedAt).not.toBeNull();
    void b;
  });

  it("refuses a match that is not cancelled", async () => {
    const { t, a, b } = await playoffTournament();
    const m = await addMatch(t.id, a.id, b.id, "semi", 5);
    await expect(restoreMatch(m.id)).rejects.toThrow(/zrušen/i);
  });
});
