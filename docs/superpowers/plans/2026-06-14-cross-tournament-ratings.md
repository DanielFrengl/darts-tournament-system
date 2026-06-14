# Cross-Tournament Ratings + Monte Carlo Odds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry player Elo across tournaments, seed a new tournament from history, compute tournament-winner odds via Monte Carlo, link players to accounts created at registration, and auto-recompute ratings after each tournament.

**Architecture:** Add a persistent `competitors` table (canonical Elo) referenced by per-tournament `players` (working Elo). A pure simulation module produces winner/place/phase probabilities that replace the current uniform `1/N` in `market.ts`. A seed script imports historical results and replays Elo. A tournament-finish hook writes working Elo back to competitors.

**Tech Stack:** Next.js 16, Drizzle ORM (Postgres), Vitest (unit in `tests/unit`, integration in `tests/integration` against Postgres on `:5434`).

---

## Critical-path ordering (deadline: registration tomorrow)

1. Task 1 (schema) → 2 (sim core) → 3 (sim into markets) — odds engine.
2. Task 4 (import) → 5 (seed roster from competitor) — get history in, seed new tournament.
3. Task 7 (admin linking) — needed during registration tomorrow.
4. Task 6 (writeback) and Task 8 (visualization) — can follow registration.

## File structure

- `src/db/schema.ts` — add `competitors` table, `players.competitorId`.
- `src/db/migrations/XXXX_*.sql` — generated migration.
- `src/lib/tournament-sim.ts` — pure Monte Carlo simulation (no DB).
- `tests/unit/tournament-sim.test.ts` — unit tests for the sim.
- `src/lib/market.ts` — winner/places use sim probabilities.
- `src/lib/rating-replay.ts` — pure Elo-replay over an ordered match list.
- `tests/unit/rating-replay.test.ts` — unit tests for replay.
- `scripts/import-history.ts` — reads JSON, writes competitors/tournaments/players/matches, runs replay.
- `src/lib/competitor.ts` — seed-from-competitor + writeback helpers.
- `tests/integration/competitor.test.ts` — DB tests for seeding + writeback.
- `src/app/admin/competitors/page.tsx` + `actions.ts` — linking UI.
- `src/app/admin/tournaments/[id]/odds-viz/` (or panel) — visualization views.

---

## Task 1: `competitors` table + `players.competitorId`

**Files:**
- Modify: `src/db/schema.ts`
- Create: migration via `npm run db:generate`

- [ ] **Step 1: Add the schema**

In `src/db/schema.ts`, after the `players` table add:

```ts
export const competitors = pgTable("competitors", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: varchar("display_name", { length: 80 }).notNull(),
  eloRating: integer("elo_rating").notNull().default(1500),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "set null" })
    .unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

In the `players` table definition, add the column inside the columns object:

```ts
    competitorId: uuid("competitor_id").references(() => competitors.id, {
      onDelete: "set null",
    }),
```

And add to the `players` index callback:

```ts
    competitorIdx: index("players_competitor_idx").on(t.competitorId),
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new file under `src/db/migrations/` creating `competitors` and altering `players`. No errors.

- [ ] **Step 3: Apply to the test DB and type-check**

Run: `npm run type-check`
Expected: PASS (no TS errors).

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts src/db/migrations
git commit -m "feat(db): add competitors table and players.competitorId"
```

---

## Task 2: Monte Carlo simulation core (pure)

**Files:**
- Create: `src/lib/tournament-sim.ts`
- Test: `tests/unit/tournament-sim.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/tournament-sim.test.ts
import { describe, it, expect } from "vitest";
import { simulateTournament, type SimPlayer, type SimConfig } from "@/lib/tournament-sim";

const cfg: SimConfig = {
  groupCount: 2, groupSize: 2, advancePerGroup: 1,
  bestOfGroup: 3, bestOfQuarter: 3, bestOfSemi: 3, bestOfFinal: 3,
  thirdPlaceMatch: false,
};

function players(ratings: number[]): SimPlayer[] {
  return ratings.map((r, i) => ({ id: `p${i}`, name: `P${i}`, eloRating: r }));
}

// deterministic RNG so the test is stable
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("simulateTournament", () => {
  it("win probabilities sum to ~1", () => {
    const res = simulateTournament(players([1600, 1500, 1400, 1300]), cfg, {
      runs: 2000, rng: seeded(1),
    });
    const total = Object.values(res.winProb).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it("stronger player wins more often", () => {
    const res = simulateTournament(players([1800, 1500, 1500, 1200]), cfg, {
      runs: 4000, rng: seeded(7),
    });
    expect(res.winProb["p0"]).toBeGreaterThan(res.winProb["p3"]);
  });

  it("is deterministic for a fixed seed", () => {
    const a = simulateTournament(players([1600, 1500, 1400, 1300]), cfg, { runs: 1000, rng: seeded(42) });
    const b = simulateTournament(players([1600, 1500, 1400, 1300]), cfg, { runs: 1000, rng: seeded(42) });
    expect(a.winProb).toEqual(b.winProb);
  });

  it("reachProb champion equals winProb", () => {
    const res = simulateTournament(players([1600, 1500, 1400, 1300]), cfg, { runs: 1000, rng: seeded(3) });
    expect(res.reachProb["p0"][4]).toBeCloseTo(res.winProb["p0"], 10);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/tournament-sim.test.ts`
Expected: FAIL — cannot find module `@/lib/tournament-sim`.

- [ ] **Step 3: Implement the simulation**

```ts
// src/lib/tournament-sim.ts
// Pure Monte Carlo tournament simulation. No DB, no IO.
import { winProbability } from "@/lib/elo";

export interface SimPlayer { id: string; name: string; eloRating: number; }

export interface SimConfig {
  groupCount: number;
  groupSize: number;
  advancePerGroup: number;
  bestOfGroup: number;
  bestOfQuarter: number;
  bestOfSemi: number;
  bestOfFinal: number;
  thirdPlaceMatch?: boolean;
}

export interface SimResult {
  runs: number;
  winProb: Record<string, number>;
  runnerUpProb: Record<string, number>;
  thirdProb: Record<string, number>;
  // [group, quarter, semi, final, champion] = P(reached at least this stage)
  reachProb: Record<string, number[]>;
  // distribution over buckets [champion, finalist, semifinalist, quarterfinalist, group]
  placeDist: Record<string, number[]>;
}

const PHASES = 5; // group, quarter, semi, final, champion
const BUCKETS = 5; // champion, finalist, semifinalist, quarterfinalist, group

export interface SimOptions { runs?: number; rng?: () => number; }

export function simulateTournament(
  players: SimPlayer[],
  cfg: SimConfig,
  opts: SimOptions = {}
): SimResult {
  const runs = opts.runs ?? 10000;
  const rng = opts.rng ?? Math.random;

  const win: Record<string, number> = {};
  const runner: Record<string, number> = {};
  const third: Record<string, number> = {};
  const reach: Record<string, number[]> = {};
  const place: Record<string, number[]> = {};
  for (const p of players) {
    win[p.id] = 0; runner[p.id] = 0; third[p.id] = 0;
    reach[p.id] = [0, 0, 0, 0, 0];
    place[p.id] = [0, 0, 0, 0, 0];
  }

  for (let r = 0; r < runs; r++) {
    const out = simulateOnce(players, cfg, rng);
    win[out.champion]++;
    if (out.runnerUp) runner[out.runnerUp]++;
    if (out.third) third[out.third]++;
    for (const p of players) {
      const stage = out.reached[p.id]; // 0..4
      for (let s = 0; s <= stage; s++) reach[p.id][s]++;
      place[p.id][out.bucket[p.id]]++;
    }
  }

  const norm = (m: Record<string, number>) => {
    const o: Record<string, number> = {};
    for (const k in m) o[k] = m[k] / runs;
    return o;
  };
  const normArr = (m: Record<string, number[]>) => {
    const o: Record<string, number[]> = {};
    for (const k in m) o[k] = m[k].map((c) => c / runs);
    return o;
  };

  return {
    runs,
    winProb: norm(win),
    runnerUpProb: norm(runner),
    thirdProb: norm(third),
    reachProb: normArr(reach),
    placeDist: normArr(place),
  };
}

interface OnceResult {
  champion: string;
  runnerUp: string | null;
  third: string | null;
  reached: Record<string, number>; // playerId -> max stage 0..4
  bucket: Record<string, number>;  // playerId -> bucket 0..4
}

function simulateOnce(players: SimPlayer[], cfg: SimConfig, rng: () => number): OnceResult {
  const reached: Record<string, number> = {};
  const bucket: Record<string, number> = {};
  for (const p of players) { reached[p.id] = 0; bucket[p.id] = 4; } // default: group stage

  // random draw into groups
  const pool = shuffle(players.slice(), rng);
  const groups: SimPlayer[][] = Array.from({ length: cfg.groupCount }, () => []);
  pool.forEach((p, i) => groups[i % cfg.groupCount].push(p));

  const advancers: SimPlayer[] = [];
  for (const g of groups) {
    const wins: Record<string, number> = {};
    g.forEach((p) => (wins[p.id] = 0));
    for (let i = 0; i < g.length; i++)
      for (let j = i + 1; j < g.length; j++)
        wins[playMatch(g[i], g[j], cfg.bestOfGroup, rng).id]++;
    const ranked = g.slice().sort((a, b) => wins[b.id] - wins[a.id] || rng() - 0.5);
    ranked.slice(0, cfg.advancePerGroup).forEach((p) => {
      advancers.push(p);
      reached[p.id] = Math.max(reached[p.id], 1); // reached bracket (quarter)
      bucket[p.id] = Math.min(bucket[p.id], 3);    // at least quarterfinalist
    });
  }

  // bracket, seeded by Elo so strong players meet late
  advancers.sort((a, b) => b.eloRating - a.eloRating);
  let round = seedBracket(advancers);
  let runnerUp: string | null = null;
  let third: string | null = null;
  const semiLosers: string[] = [];

  while (round.length > 1) {
    const isFinal = round.length === 2;
    const isSemi = round.length === 4;
    const bestOf = isFinal ? cfg.bestOfFinal : isSemi ? cfg.bestOfSemi : cfg.bestOfQuarter;
    const winnerStage = isFinal ? 4 : isSemi ? 3 : 2; // champion / final / semi
    const next: SimPlayer[] = [];
    for (let i = 0; i < round.length; i += 2) {
      const a = round[i], b = round[i + 1];
      if (!b) { next.push(a); continue; }
      const w = playMatch(a, b, bestOf, rng);
      const l = w === a ? b : a;
      reached[w.id] = Math.max(reached[w.id], winnerStage);
      if (isFinal) { runnerUp = l.id; bucket[l.id] = Math.min(bucket[l.id], 1); reached[l.id] = Math.max(reached[l.id], 3); }
      else if (isSemi) { semiLosers.push(l.id); bucket[l.id] = Math.min(bucket[l.id], 2); reached[l.id] = Math.max(reached[l.id], 2); }
      next.push(w);
    }
    round = next;
  }

  const champion = round[0].id;
  reached[champion] = 4; bucket[champion] = 0;

  if (cfg.thirdPlaceMatch && semiLosers.length === 2) {
    const a = players.find((p) => p.id === semiLosers[0])!;
    const b = players.find((p) => p.id === semiLosers[1])!;
    third = playMatch(a, b, cfg.bestOfSemi, rng).id;
  } else if (semiLosers.length) {
    third = semiLosers[0];
  }

  return { champion, runnerUp, third, reached, bucket };
}

// first to ceil(bestOf/2) legs; each leg won by A with winProbability(elo)
function playMatch(a: SimPlayer, b: SimPlayer, bestOf: number, rng: () => number): SimPlayer {
  const need = Math.ceil(bestOf / 2);
  const pA = winProbability(a.eloRating, b.eloRating);
  let wa = 0, wb = 0;
  while (wa < need && wb < need) (rng() < pA ? wa++ : wb++);
  return wa >= need ? a : b;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// classic 1..N seed order, byes (undefined) dropped
function seedBracket(list: SimPlayer[]): SimPlayer[] {
  let n = 1;
  while (n < list.length) n *= 2;
  const seeds: (SimPlayer | null)[] = list.slice();
  while (seeds.length < n) seeds.push(null);
  let order = [0];
  for (let size = 1; size < n; size *= 2) {
    const nextOrder: number[] = [];
    for (const s of order) { nextOrder.push(s); nextOrder.push(size * 2 - 1 - s); }
    order = nextOrder;
  }
  return order.map((i) => seeds[i]).filter((x): x is SimPlayer => x !== null);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/unit/tournament-sim.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament-sim.ts tests/unit/tournament-sim.test.ts
git commit -m "feat(sim): pure Monte Carlo tournament simulation"
```

---

## Task 3: Use simulation in winner/place markets

**Files:**
- Modify: `src/lib/market.ts` (`createTournamentWinner` ~188-228, `createTournamentPlaces` ~235-278)
- Test: `tests/integration/market-lifecycle.test.ts` (add cases)

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/market-lifecycle.test.ts` (mirror existing setup in that file for creating a tournament with players):

```ts
it("tournament winner odds favor the higher-rated player", async () => {
  // create a tournament with config + 4 players of differing elo
  const { tournamentId, strongPlayerId, weakPlayerId } =
    await seedTournamentWithRatings(testDb, [1800, 1500, 1500, 1200]); // helper in factories
  const svc = new MarketService(testDb);
  await svc.createTournamentWinner(tournamentId);

  const [market] = await testDb.select().from(markets)
    .where(and(eq(markets.tournamentId, tournamentId), eq(markets.type, "tournament_winner")));
  const sels = await testDb.select().from(marketSelections)
    .where(eq(marketSelections.marketId, market.id));

  const strong = sels.find((s) => s.playerId === strongPlayerId)!;
  const weak = sels.find((s) => s.playerId === weakPlayerId)!;
  // higher win probability => shorter (smaller) odds
  expect(Number(strong.finalOdds)).toBeLessThan(Number(weak.finalOdds));
});
```

Add the `seedTournamentWithRatings` helper to `tests/setup/factories.ts`:

```ts
export async function seedTournamentWithRatings(db: typeof testDb, ratings: number[]) {
  const cfg = { groupCount: 2, groupSize: 2, advancePerGroup: 1,
    bestOfGroup: 3, bestOfQuarter: 3, bestOfSemi: 3, bestOfFinal: 7, thirdPlaceMatch: false };
  const [t] = await db.insert(tournaments).values({ name: "Sim T", status: "draft", configJson: cfg }).returning();
  const inserted = [];
  for (let i = 0; i < ratings.length; i++) {
    const [p] = await db.insert(players).values({
      tournamentId: t.id, name: `P${i}`, eloRating: ratings[i],
    }).returning();
    inserted.push(p);
  }
  return { tournamentId: t.id, strongPlayerId: inserted[0].id, weakPlayerId: inserted[inserted.length - 1].id };
}
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/integration/market-lifecycle.test.ts -t "favor the higher-rated"`
Expected: FAIL — odds equal (current uniform `1/N`).

- [ ] **Step 3: Replace uniform probability with simulation**

In `src/lib/market.ts`, add import at top:

```ts
import { simulateTournament, type SimConfig } from "@/lib/tournament-sim";
```

In `createTournamentWinner`, replace the `tPlayers.map(... probability: 1 / tPlayers.length ...)` block with:

```ts
const sim = simulateTournament(
  tPlayers.map((p) => ({ id: p.id, name: p.name, eloRating: p.eloRating })),
  toSimConfig(cfg),
  { runs: 10000 }
);
await this.insertMarket(
  { tournamentId, type: "tournament_winner", scope: "tournament", status: "open" },
  tPlayers.map((p) => ({
    label: p.name, playerId: p.id, scoreA: null, scoreB: null,
    probability: clampProb(sim.winProb[p.id], tPlayers.length),
  })),
  cfg
);
```

In `createTournamentPlaces`, compute the sim once and use `runnerUpProb` / `thirdProb`:

```ts
const sim = simulateTournament(
  tPlayers.map((p) => ({ id: p.id, name: p.name, eloRating: p.eloRating })),
  toSimConfig(cfg),
  { runs: 10000 }
);
// per placeMarket type:
const probMap = type === "tournament_runner_up" ? sim.runnerUpProb : sim.thirdProb;
// in the selections map:
probability: clampProb(probMap[p.id], tPlayers.length),
```

Add these helpers near the bottom of `market.ts`:

```ts
function toSimConfig(cfg: TournamentConfig): SimConfig {
  return {
    groupCount: cfg.groupCount, groupSize: cfg.groupSize, advancePerGroup: cfg.advancePerGroup,
    bestOfGroup: cfg.bestOfGroup, bestOfQuarter: cfg.bestOfQuarter,
    bestOfSemi: cfg.bestOfSemi, bestOfFinal: cfg.bestOfFinal,
    thirdPlaceMatch: cfg.thirdPlaceMatch,
  };
}
// never feed 0 to probabilityToOdds; floor at a small epsilon relative to field size
function clampProb(p: number | undefined, fieldSize: number): number {
  const floor = 1 / (fieldSize * 50);
  return Math.min(0.999, Math.max(floor, p ?? 1 / fieldSize));
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/integration/market-lifecycle.test.ts`
Expected: PASS (existing + new case).

- [ ] **Step 5: Commit**

```bash
git add src/lib/market.ts tests/integration/market-lifecycle.test.ts tests/setup/factories.ts
git commit -m "feat(odds): tournament winner/place odds from Monte Carlo ratings"
```

---

## Task 4: Historical import + Elo replay

**Files:**
- Create: `src/lib/rating-replay.ts`
- Test: `tests/unit/rating-replay.test.ts`
- Create: `scripts/import-history.ts`
- Modify: `package.json` (add script)

- [ ] **Step 1: Write the failing test for the pure replay**

```ts
// tests/unit/rating-replay.test.ts
import { describe, it, expect } from "vitest";
import { replayElo, type ReplayMatch } from "@/lib/rating-replay";

describe("replayElo", () => {
  it("rewards the consistent winner", () => {
    const matches: ReplayMatch[] = [
      { winner: "A", loser: "B" }, { winner: "A", loser: "B" }, { winner: "A", loser: "C" },
    ];
    const ratings = replayElo(["A", "B", "C"], matches);
    expect(ratings["A"]).toBeGreaterThan(1500);
    expect(ratings["B"]).toBeLessThan(1500);
  });

  it("starts everyone at 1500 and conserves order of play", () => {
    const ratings = replayElo(["A", "B"], [{ winner: "B", loser: "A" }]);
    expect(ratings["B"]).toBeGreaterThan(ratings["A"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/rating-replay.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement replay**

```ts
// src/lib/rating-replay.ts
import { updateRatings, DEFAULT_RATING } from "@/lib/elo";

export interface ReplayMatch { winner: string; loser: string; }

// Replays matches in the given order, starting everyone at 1500.
// Returns final rating per competitor name.
export function replayElo(names: string[], matches: ReplayMatch[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const n of names) r[n] = DEFAULT_RATING;
  for (const m of matches) {
    if (r[m.winner] === undefined) r[m.winner] = DEFAULT_RATING;
    if (r[m.loser] === undefined) r[m.loser] = DEFAULT_RATING;
    const { nextA, nextB } = updateRatings(r[m.winner], r[m.loser], "A");
    r[m.winner] = nextA;
    r[m.loser] = nextB;
  }
  return r;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/unit/rating-replay.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the import script**

```ts
// scripts/import-history.ts
// Usage: node --env-file=.env --import tsx scripts/import-history.ts data/history.json
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { replayElo, type ReplayMatch } from "../src/lib/rating-replay";

interface Input {
  competitors: string[];
  tournaments: { name: string; matches: { a: string; b: string; scoreA: number; scoreB: number }[] }[];
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: import-history <file.json>");
  const input = JSON.parse(readFileSync(file, "utf8")) as Input;

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const db = drizzle(client, { schema });

  // 1. upsert competitors (by displayName)
  const compId: Record<string, string> = {};
  for (const name of input.competitors) {
    const existing = await db.select().from(schema.competitors)
      .where(eq(schema.competitors.displayName, name));
    if (existing[0]) { compId[name] = existing[0].id; continue; }
    const [c] = await db.insert(schema.competitors).values({ displayName: name }).returning();
    compId[name] = c.id;
  }

  // 2. ordered match list across all tournaments for the replay
  const replayMatches: ReplayMatch[] = [];

  for (const t of input.tournaments) {
    const cfg = {
      groupCount: 1, groupSize: input.competitors.length, advancePerGroup: 2,
      bestOfGroup: 3, bestOfQuarter: 5, bestOfSemi: 5, bestOfFinal: 7, thirdPlaceMatch: false,
    };
    const [tour] = await db.insert(schema.tournaments)
      .values({ name: t.name, status: "finished", configJson: cfg, finishedAt: new Date() })
      .returning();

    // players for the names that appear in this tournament
    const namesHere = new Set<string>();
    t.matches.forEach((m) => { namesHere.add(m.a); namesHere.add(m.b); });
    const playerId: Record<string, string> = {};
    for (const name of namesHere) {
      const [p] = await db.insert(schema.players)
        .values({ tournamentId: tour.id, name, competitorId: compId[name] })
        .returning();
      playerId[name] = p.id;
    }

    for (const m of t.matches) {
      const winnerName = m.scoreA >= m.scoreB ? m.a : m.b;
      const loserName = winnerName === m.a ? m.b : m.a;
      await db.insert(schema.matches).values({
        tournamentId: tour.id, phase: "group", bestOf: 3,
        playerAId: playerId[m.a], playerBId: playerId[m.b],
        scoreA: m.scoreA, scoreB: m.scoreB,
        status: "finished", winnerId: playerId[winnerName], finishedAt: new Date(),
      });
      replayMatches.push({ winner: winnerName, loser: loserName });
    }
  }

  // 3. replay Elo and persist onto competitors
  const finalRatings = replayElo(input.competitors, replayMatches);
  for (const name of input.competitors) {
    await db.update(schema.competitors)
      .set({ eloRating: Math.round(finalRatings[name]) })
      .where(eq(schema.competitors.id, compId[name]));
  }

  console.log("Imported. Final ratings:");
  for (const name of input.competitors) console.log(`  ${name}: ${Math.round(finalRatings[name])}`);
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 6: Add the npm script**

In `package.json` `scripts`, add:

```json
"import-history": "node --env-file=.env --import tsx scripts/import-history.ts"
```

(If `tsx` is not installed: `npm i -D tsx`.)

- [ ] **Step 7: Smoke-run against a sample file**

Create `data/history.sample.json` with 2 small tournaments, then run:
`npm run import-history data/history.sample.json`
Expected: prints final ratings; competitors/tournaments/players/matches rows created.

- [ ] **Step 8: Commit**

```bash
git add src/lib/rating-replay.ts tests/unit/rating-replay.test.ts scripts/import-history.ts package.json data/history.sample.json
git commit -m "feat(import): historical import with Elo replay into competitors"
```

---

## Task 5: Seed new-tournament players from competitor

**Files:**
- Create: `src/lib/competitor.ts`
- Test: `tests/integration/competitor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/competitor.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb, truncateAll, teardownTestDb, testDb } from "../setup/db";
import { competitors, players, tournaments } from "@/db/schema";
import { addPlayerFromCompetitor } from "@/lib/competitor";

beforeAll(setupTestDb); afterAll(teardownTestDb); beforeEach(truncateAll);

it("seeds player elo from the linked competitor", async () => {
  const [c] = await testDb.insert(competitors).values({ displayName: "Honza", eloRating: 1712 }).returning();
  const [t] = await testDb.insert(tournaments).values({ name: "T3", status: "draft", configJson: {} }).returning();

  const player = await addPlayerFromCompetitor(testDb, t.id, c.id);

  expect(player.eloRating).toBe(1712);
  expect(player.competitorId).toBe(c.id);
});

it("creates a fresh competitor at 1500 for a newcomer", async () => {
  const [t] = await testDb.insert(tournaments).values({ name: "T3", status: "draft", configJson: {} }).returning();
  const player = await addNewcomer(testDb, t.id, "Nováček");
  expect(player.eloRating).toBe(1500);
  const [c] = await testDb.select().from(competitors).where(eq(competitors.id, player.competitorId!));
  expect(c.eloRating).toBe(1500);
});
```

(Import `addNewcomer` too.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/integration/competitor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/competitor.ts
import { eq } from "drizzle-orm";
import { competitors, players } from "@/db/schema";

type DB = typeof import("../../tests/setup/db").testDb; // structural; same drizzle instance shape

export async function addPlayerFromCompetitor(db: any, tournamentId: string, competitorId: string) {
  const [c] = await db.select().from(competitors).where(eq(competitors.id, competitorId));
  if (!c) throw new Error("competitor not found");
  const [p] = await db.insert(players).values({
    tournamentId, name: c.displayName, competitorId: c.id, eloRating: c.eloRating, userId: c.userId,
  }).returning();
  return p;
}

export async function addNewcomer(db: any, tournamentId: string, displayName: string) {
  const [c] = await db.insert(competitors).values({ displayName }).returning(); // defaults 1500
  const [p] = await db.insert(players).values({
    tournamentId, name: displayName, competitorId: c.id, eloRating: c.eloRating,
  }).returning();
  return p;
}
```

(Use the project's real DB type instead of `any` if a shared `Db` type exists — check `src/db/index.ts`.)

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/integration/competitor.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into the admin "add player" flow**

In the tournament players admin action (`src/app/admin/tournaments/[id]/players/actions.ts` — confirm path), when adding a player, call `addPlayerFromCompetitor` (existing competitor selected) or `addNewcomer` (new name). Keep existing manual-elo path as fallback.

- [ ] **Step 6: Commit**

```bash
git add src/lib/competitor.ts tests/integration/competitor.test.ts src/app/admin
git commit -m "feat(roster): seed new-tournament players from competitor rating"
```

---

## Task 6: Writeback on tournament finish

**Files:**
- Modify: `src/lib/match-lifecycle.ts` or `src/lib/tournament.ts` (wherever status → finished happens)
- Test: `tests/integration/competitor.test.ts` (add case)

- [ ] **Step 1: Write the failing test**

```ts
it("writes final player elo back to competitor on finish", async () => {
  const [c] = await testDb.insert(competitors).values({ displayName: "Honza", eloRating: 1500 }).returning();
  const [t] = await testDb.insert(tournaments).values({ name: "T", status: "active", configJson: {} }).returning();
  await testDb.insert(players).values({ tournamentId: t.id, name: "Honza", competitorId: c.id, eloRating: 1640 });

  await finalizeTournamentRatings(testDb, t.id); // the new helper

  const [after] = await testDb.select().from(competitors).where(eq(competitors.id, c.id));
  expect(after.eloRating).toBe(1640);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/integration/competitor.test.ts -t "writes final player elo"`
Expected: FAIL — `finalizeTournamentRatings` not defined.

- [ ] **Step 3: Implement and hook it**

Add to `src/lib/competitor.ts`:

```ts
import { and } from "drizzle-orm";
import { isNotNull } from "drizzle-orm";

export async function finalizeTournamentRatings(db: any, tournamentId: string) {
  const rows = await db.select().from(players)
    .where(and(eq(players.tournamentId, tournamentId), isNotNull(players.competitorId)));
  for (const p of rows) {
    await db.update(competitors).set({ eloRating: p.eloRating }).where(eq(competitors.id, p.competitorId));
  }
}
```

Call `finalizeTournamentRatings(db, tournamentId)` in the code path that sets a tournament to `finished` (find it: `grep -n "finished" src/lib/tournament.ts src/lib/match-lifecycle.ts`).

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/integration/competitor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/competitor.ts src/lib/tournament.ts tests/integration/competitor.test.ts
git commit -m "feat(ratings): write working elo back to competitor on tournament finish"
```

---

## Task 7: Admin account-linking screen

**Files:**
- Create: `src/app/admin/competitors/page.tsx`
- Create: `src/app/admin/competitors/actions.ts`
- Test: `tests/integration/competitor.test.ts` (action-level test)

- [ ] **Step 1: Write the failing test for the link action**

```ts
import { linkCompetitorToUser } from "@/app/admin/competitors/actions";

it("links a competitor to a user and propagates to active players", async () => {
  const [u] = await testDb.insert(users).values({
    email: "h@x.cz", username: "honza", passwordHash: "x",
  }).returning();
  const [c] = await testDb.insert(competitors).values({ displayName: "Honza", eloRating: 1600 }).returning();
  const [t] = await testDb.insert(tournaments).values({ name: "T", status: "active", configJson: {} }).returning();
  const [p] = await testDb.insert(players).values({ tournamentId: t.id, name: "Honza", competitorId: c.id }).returning();

  await linkCompetitorToUser(testDb, c.id, u.id);

  const [c2] = await testDb.select().from(competitors).where(eq(competitors.id, c.id));
  const [p2] = await testDb.select().from(players).where(eq(players.id, p.id));
  expect(c2.userId).toBe(u.id);
  expect(p2.userId).toBe(u.id);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/integration/competitor.test.ts -t "links a competitor"`
Expected: FAIL — module/function not found.

- [ ] **Step 3: Implement the action (pure DB function + thin server-action wrapper)**

```ts
// src/app/admin/competitors/actions.ts
"use server";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/db";
import { competitors, players, tournaments } from "@/db/schema";
import { requireAdmin } from "@/lib/auth"; // confirm helper name in roles.ts/auth.ts

export async function linkCompetitorToUser(database: any, competitorId: string, userId: string) {
  await database.update(competitors).set({ userId }).where(eq(competitors.id, competitorId));
  // propagate to players of this competitor in non-finished tournaments
  const active = await database.select({ id: players.id })
    .from(players)
    .innerJoin(tournaments, eq(players.tournamentId, tournaments.id))
    .where(and(eq(players.competitorId, competitorId)));
  for (const row of active) {
    await database.update(players).set({ userId }).where(eq(players.id, row.id));
  }
}

export async function linkAction(competitorId: string, userId: string) {
  await requireAdmin();
  await linkCompetitorToUser(db, competitorId, userId);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/integration/competitor.test.ts`
Expected: PASS.

- [ ] **Step 5: Build the page**

`src/app/admin/competitors/page.tsx`: server component listing competitors (displayName, eloRating, current linked user) with a client form per row — a `<select>` of registered users (id+username) and a submit calling `linkAction`. Follow the styling/patterns of an existing admin page (e.g. `src/app/admin/users/page.tsx`). Include a "Přepočítat kurzy" button that calls a server action invoking `MarketService.createTournamentWinner` + `createTournamentPlaces` for the active tournament (idempotent — they early-return if markets exist, so first delete existing winner/place markets or add a `recompute` variant).

- [ ] **Step 6: Manual smoke + commit**

Run `npm run dev`, open `/admin/competitors`, link a user, confirm DB row.
```bash
git add src/app/admin/competitors
git commit -m "feat(admin): competitor↔account linking screen + recompute odds"
```

---

## Task 8: Monte Carlo visualization (product feature)

**Files:**
- Create: `src/app/admin/tournaments/[id]/odds-viz/page.tsx` (+ client chart components)
- Reuse: existing charting lib (check `src/components` for the jablka balance chart from commit `22f80e7`)

- [ ] **Step 1: Expose sim aggregates**

The page's server component loads the tournament's players + config, runs `simulateTournament(..., { runs: 10000 })`, and passes `winProb`, `reachProb`, `placeDist` to client charts. For convergence, add an optional `sampleEvery` capture to the sim (extend `SimResult` with `convergence?: { id: string; series: number[] }[]` computed for the top-N by win prob) — TDD this addition in `tests/unit/tournament-sim.test.ts` first (assert series length and last value ≈ winProb).

- [ ] **Step 2: Build four views**

1. Win probability bar list (prob + fair odds).
2. Convergence line chart (top 3 by win prob).
3. Phase-reach heatmap (`reachProb`).
4. Placement distribution stacked bar (`placeDist`).

Mirror the visual structure already prototyped in `docs/monte-carlo-demo.html` (it is the reference design — reuse labels/buckets/colors). Use the project's chart components or lightweight SVG/canvas if none fit.

- [ ] **Step 3: Manual smoke + commit**

```bash
git add src/app/admin/tournaments src/lib/tournament-sim.ts tests/unit/tournament-sim.test.ts
git commit -m "feat(viz): tournament odds Monte Carlo visualization"
```

---

## Final verification

- [ ] Run the whole suite: `npm test` — Expected: all green.
- [ ] `npm run type-check` — Expected: PASS.
- [ ] `npm run lint` — Expected: PASS.
- [ ] `npm run build` — Expected: compiles (proxy/runtime already fixed).
