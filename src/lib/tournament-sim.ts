// Pure Monte Carlo tournament simulation. No DB, no IO.
import { winProbability } from "@/lib/elo";

export interface SimPlayer {
  id: string;
  name: string;
  eloRating: number;
}

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

export interface SimOptions {
  runs?: number;
  rng?: () => number;
}

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
    win[p.id] = 0;
    runner[p.id] = 0;
    third[p.id] = 0;
    reach[p.id] = [0, 0, 0, 0, 0];
    place[p.id] = [0, 0, 0, 0, 0];
  }

  for (let r = 0; r < runs; r++) {
    const out = simulateOnce(players, cfg, rng);
    win[out.champion] = (win[out.champion] ?? 0) + 1;
    if (out.runnerUp) runner[out.runnerUp] = (runner[out.runnerUp] ?? 0) + 1;
    if (out.third) third[out.third] = (third[out.third] ?? 0) + 1;
    for (const p of players) {
      const stage = out.reached[p.id] ?? 0;
      const rp = reach[p.id]!;
      for (let s = 0; s <= stage; s++) rp[s] = (rp[s] ?? 0) + 1;
      const pl = place[p.id]!;
      const bk = out.bucket[p.id] ?? 4;
      pl[bk] = (pl[bk] ?? 0) + 1;
    }
  }

  const norm = (m: Record<string, number>) => {
    const o: Record<string, number> = {};
    for (const k in m) o[k] = m[k]! / runs;
    return o;
  };
  const normArr = (m: Record<string, number[]>) => {
    const o: Record<string, number[]> = {};
    for (const k in m) o[k] = m[k]!.map((c) => c / runs);
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
  bucket: Record<string, number>; // playerId -> bucket 0..4
}

function simulateOnce(
  players: SimPlayer[],
  cfg: SimConfig,
  rng: () => number
): OnceResult {
  const reached: Record<string, number> = {};
  const bucket: Record<string, number> = {};
  for (const p of players) {
    reached[p.id] = 0;
    bucket[p.id] = 4; // default: group stage
  }

  // random draw into groups
  const pool = shuffle(players.slice(), rng);
  const groups: SimPlayer[][] = Array.from({ length: cfg.groupCount }, () => []);
  pool.forEach((p, i) => groups[i % cfg.groupCount]!.push(p));

  const advancers: SimPlayer[] = [];
  for (const g of groups) {
    const wins: Record<string, number> = {};
    g.forEach((p) => (wins[p.id] = 0));
    for (let i = 0; i < g.length; i++)
      for (let j = i + 1; j < g.length; j++) {
        const w = playMatch(g[i]!, g[j]!, cfg.bestOfGroup, rng);
        wins[w.id] = (wins[w.id] ?? 0) + 1;
      }
    const ranked = g
      .slice()
      .sort((a, b) => (wins[b.id] ?? 0) - (wins[a.id] ?? 0) || rng() - 0.5);
    ranked.slice(0, cfg.advancePerGroup).forEach((p) => {
      advancers.push(p);
      reached[p.id] = Math.max(reached[p.id] ?? 0, 1); // reached bracket (quarter)
      bucket[p.id] = Math.min(bucket[p.id] ?? 4, 3); // at least quarterfinalist
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
    const bestOf = isFinal
      ? cfg.bestOfFinal
      : isSemi
        ? cfg.bestOfSemi
        : cfg.bestOfQuarter;
    const winnerStage = isFinal ? 4 : isSemi ? 3 : 2; // champion / final / semi
    const next: SimPlayer[] = [];
    for (let i = 0; i < round.length; i += 2) {
      const a = round[i]!;
      const b = round[i + 1];
      if (!b) {
        next.push(a);
        continue;
      }
      const w = playMatch(a, b, bestOf, rng);
      const l = w === a ? b : a;
      reached[w.id] = Math.max(reached[w.id] ?? 0, winnerStage);
      if (isFinal) {
        runnerUp = l.id;
        bucket[l.id] = Math.min(bucket[l.id] ?? 4, 1);
        reached[l.id] = Math.max(reached[l.id] ?? 0, 3);
      } else if (isSemi) {
        semiLosers.push(l.id);
        bucket[l.id] = Math.min(bucket[l.id] ?? 4, 2);
        reached[l.id] = Math.max(reached[l.id] ?? 0, 2);
      }
      next.push(w);
    }
    round = next;
  }

  const champion = round[0]!.id;
  reached[champion] = 4;
  bucket[champion] = 0;

  if (cfg.thirdPlaceMatch && semiLosers.length === 2) {
    const a = players.find((p) => p.id === semiLosers[0])!;
    const b = players.find((p) => p.id === semiLosers[1])!;
    third = playMatch(a, b, cfg.bestOfSemi, rng).id;
  } else if (semiLosers.length) {
    third = semiLosers[0]!;
  }

  return { champion, runnerUp, third, reached, bucket };
}

// first to ceil(bestOf/2) legs; each leg won by A with winProbability(elo)
function playMatch(
  a: SimPlayer,
  b: SimPlayer,
  bestOf: number,
  rng: () => number
): SimPlayer {
  const need = Math.ceil(bestOf / 2);
  const pA = winProbability(a.eloRating, b.eloRating);
  let wa = 0;
  let wb = 0;
  while (wa < need && wb < need) {
    if (rng() < pA) wa++;
    else wb++;
  }
  return wa >= need ? a : b;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

// classic 1..N seed order, byes (null) dropped
function seedBracket(list: SimPlayer[]): SimPlayer[] {
  let n = 1;
  while (n < list.length) n *= 2;
  const seeds: (SimPlayer | null)[] = list.slice();
  while (seeds.length < n) seeds.push(null);
  let order = [0];
  for (let size = 1; size < n; size *= 2) {
    const nextOrder: number[] = [];
    for (const s of order) {
      nextOrder.push(s);
      nextOrder.push(size * 2 - 1 - s);
    }
    order = nextOrder;
  }
  return order
    .map((i) => seeds[i] ?? null)
    .filter((x): x is SimPlayer => x !== null);
}
