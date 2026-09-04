// Pure Monte Carlo tournament simulation. No DB, no IO.
//
// The simulated tournament is played by the same rules as the real one: the
// group stage is ranked with `computeStandings` (points, then leg
// difference, then head-to-head) and the playoff is cross-seeded with
// `seedBracket`. Anything else would price markets for a tournament this
// app does not actually run.
import { winProbability } from "@/lib/elo";
import { computeStandings, type FinishedMatch } from "@/lib/standings";
import {
  seedBracket,
  type BracketMatch,
  type GroupAdvancers,
} from "@/lib/bracket-seed";

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

/**
 * The rounds this tournament actually has, from the group stage to the
 * title. A 4-player playoff has no quarterfinal, so it never reports one.
 */
export type SimStage = "group" | "quarter" | "semi" | "final" | "champion";

export interface SimResult {
  runs: number;
  /**
   * Stages of this tournament, earliest first, always starting at "group"
   * and ending at "champion". `reachProb` is indexed by this array;
   * `placeDist` by its reverse (champion first, group stage last).
   */
  stages: SimStage[];
  winProb: Record<string, number>;
  runnerUpProb: Record<string, number>;
  thirdProb: Record<string, number>;
  /** P(reached at least stages[i]), so index 0 is always 1. */
  reachProb: Record<string, number[]>;
  /** Distribution over how far a player got, best finish first. */
  placeDist: Record<string, number[]>;
  // running win-probability estimate for the top favorites, sampled over the run
  convergence: { id: string; name: string; series: number[] }[];
}

export interface SimOptions {
  runs?: number;
  rng?: () => number;
  convergenceTop?: number;
  /**
   * The group draw that has already happened, as player ids per group in
   * group order (A, B, C…). Once the draw is public the simulation must
   * use it rather than re-drawing groups every run — otherwise it prices a
   * tournament nobody is playing. Omit while the draw is still open.
   */
  draw?: string[][];
}

export function simulateTournament(
  players: SimPlayer[],
  cfg: SimConfig,
  opts: SimOptions = {}
): SimResult {
  const runs = Math.max(1, Math.floor(opts.runs ?? 10000));
  const rng = opts.rng ?? Math.random;
  const draw = normalizeDraw(players, cfg, opts.draw);
  const stages = stagesFor(bracketSizeFor(players.length, cfg, draw));
  const stageCount = stages.length;

  const win: Record<string, number> = {};
  const runner: Record<string, number> = {};
  const third: Record<string, number> = {};
  const reach: Record<string, number[]> = {};
  const place: Record<string, number[]> = {};
  for (const p of players) {
    win[p.id] = 0;
    runner[p.id] = 0;
    third[p.id] = 0;
    reach[p.id] = new Array<number>(stageCount).fill(0);
    place[p.id] = new Array<number>(stageCount).fill(0);
  }

  const samples: Record<string, number[]> = {};
  for (const p of players) samples[p.id] = [];
  const sampleEvery = Math.max(1, Math.floor(runs / 120));

  for (let r = 0; r < runs; r++) {
    const out = simulateOnce(players, cfg, rng, draw, stageCount);
    if (out.champion) win[out.champion] = (win[out.champion] ?? 0) + 1;
    if (out.runnerUp) runner[out.runnerUp] = (runner[out.runnerUp] ?? 0) + 1;
    if (out.third) third[out.third] = (third[out.third] ?? 0) + 1;
    for (const p of players) {
      const stage = out.reached[p.id] ?? 0;
      const rp = reach[p.id]!;
      for (let s = 0; s <= stage && s < stageCount; s++) rp[s] = (rp[s] ?? 0) + 1;
      // Placement buckets run best-finish-first, so a player's bucket is
      // just how far they reached, counted from the other end.
      const pl = place[p.id]!;
      const bk = stageCount - 1 - Math.min(stage, stageCount - 1);
      pl[bk] = (pl[bk] ?? 0) + 1;
    }
    if ((r + 1) % sampleEvery === 0 || r + 1 === runs) {
      for (const p of players) samples[p.id]!.push((win[p.id] ?? 0) / (r + 1));
    }
  }

  const topN = opts.convergenceTop ?? 3;
  const convergence = players
    .slice()
    .sort((a, b) => (win[b.id] ?? 0) - (win[a.id] ?? 0))
    .slice(0, topN)
    .map((p) => ({ id: p.id, name: p.name, series: samples[p.id]! }));

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
    stages,
    winProb: norm(win),
    runnerUpProb: norm(runner),
    thirdProb: norm(third),
    reachProb: normArr(reach),
    placeDist: normArr(place),
    convergence,
  };
}

/** How many players contest the first playoff round, rounded up to a power of 2. */
function bracketSizeFor(
  playerCount: number,
  cfg: SimConfig,
  draw: string[][] | null
): number {
  const groupCount = draw ? draw.length : Math.max(1, Math.floor(cfg.groupCount) || 1);
  const perGroup = Math.max(1, Math.floor(cfg.advancePerGroup) || 1);
  let total = 0;
  if (draw) {
    for (const g of draw) total += Math.min(perGroup, g.length);
  } else {
    // Groups are filled round-robin, so sizes differ by at most one.
    for (let i = 0; i < groupCount; i++) {
      const size = Math.floor(playerCount / groupCount) + (i < playerCount % groupCount ? 1 : 0);
      total += Math.min(perGroup, size);
    }
  }
  let n = 1;
  while (n < total) n *= 2;
  return Math.max(2, n);
}

function stagesFor(bracketSize: number): SimStage[] {
  const out: SimStage[] = ["group"];
  for (let size = bracketSize; size >= 2; size /= 2) {
    if (size >= 8) out.push("quarter");
    else if (size === 4) out.push("semi");
    else out.push("final");
  }
  out.push("champion");
  return out;
}

/**
 * Validate the caller's draw against the player list. A stale draw (players
 * added or removed since) is dropped rather than silently simulating a
 * tournament with the wrong field.
 */
function normalizeDraw(
  players: SimPlayer[],
  cfg: SimConfig,
  draw: string[][] | undefined
): string[][] | null {
  if (!draw || draw.length === 0) return null;
  const known = new Set(players.map((p) => p.id));
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const g of draw) {
    const ids: string[] = [];
    for (const id of g) {
      if (!known.has(id) || seen.has(id)) return null;
      seen.add(id);
      ids.push(id);
    }
    out.push(ids);
  }
  if (seen.size !== players.length) return null;
  if (out.some((g) => g.length < Math.max(1, Math.floor(cfg.advancePerGroup) || 1))) {
    return null;
  }
  return out;
}

interface OnceResult {
  champion: string | null;
  runnerUp: string | null;
  third: string | null;
  reached: Record<string, number>; // playerId -> max stage index reached
}

function simulateOnce(
  players: SimPlayer[],
  cfg: SimConfig,
  rng: () => number,
  draw: string[][] | null,
  stageCount: number
): OnceResult {
  // Stage 0 is the group stage: everyone reaches it, most stop there.
  const reached: Record<string, number> = {};
  for (const p of players) reached[p.id] = 0;
  const byId = new Map(players.map((p) => [p.id, p]));

  const groups = drawGroups(players, cfg, rng, draw);

  // Group stage: full round robin, ranked by the live tournament's rules.
  const advancers: GroupAdvancers[] = [];
  const perGroup = Math.max(1, Math.floor(cfg.advancePerGroup) || 1);
  groups.forEach((g, gi) => {
    const finished: FinishedMatch[] = [];
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        const r = playMatch(g[i]!, g[j]!, cfg.bestOfGroup, rng);
        finished.push({
          playerAId: g[i]!.id,
          playerBId: g[j]!.id,
          scoreA: r.winner === g[i]! ? r.winnerLegs : r.loserLegs,
          scoreB: r.winner === g[j]! ? r.winnerLegs : r.loserLegs,
        });
      }
    }
    const ranked = computeStandings(
      g.map((p) => p.id),
      finished
    );
    advancers.push({
      groupName: String.fromCharCode("A".charCodeAt(0) + gi),
      players: ranked.slice(0, perGroup).map((s) => s.playerId),
    });
  });

  let round = openingRound(advancers, byId);
  if (round.length === 0) {
    return { champion: null, runnerUp: null, third: null, reached };
  }
  for (const p of round) {
    if (p) reached[p.id] = Math.max(reached[p.id] ?? 0, 1);
  }

  let runnerUp: string | null = null;
  let third: string | null = null;
  let semiLosers: string[] = [];
  let roundIndex = 1;

  while (round.length > 1) {
    const isFinal = round.length === 2;
    const isSemi = round.length === 4;
    const bestOf = isFinal
      ? cfg.bestOfFinal
      : isSemi
        ? cfg.bestOfSemi
        : cfg.bestOfQuarter;
    // Winning round `roundIndex` puts you in the next one.
    const winnerStage = roundIndex + 1;
    const next: (SimPlayer | null)[] = [];
    const losers: string[] = [];
    for (let i = 0; i < round.length; i += 2) {
      const a = round[i] ?? null;
      const b = round[i + 1] ?? null;
      if (!a || !b) {
        // Bye: the lone entrant walks into the next round.
        const through = a ?? b;
        if (through) reached[through.id] = Math.max(reached[through.id] ?? 0, winnerStage);
        next.push(through);
        continue;
      }
      const { winner, loser } = playMatch(a, b, bestOf, rng);
      reached[winner.id] = Math.max(reached[winner.id] ?? 0, winnerStage);
      reached[loser.id] = Math.max(reached[loser.id] ?? 0, roundIndex);
      losers.push(loser.id);
      if (isFinal) runnerUp = loser.id;
      next.push(winner);
    }
    if (isSemi) semiLosers = losers;
    round = next;
    roundIndex++;
  }

  const championPlayer = round[0] ?? null;
  const champion = championPlayer?.id ?? null;
  if (champion) reached[champion] = stageCount - 1;

  if (semiLosers.length === 2) {
    const a = byId.get(semiLosers[0]!);
    const b = byId.get(semiLosers[1]!);
    if (a && b) {
      third = cfg.thirdPlaceMatch
        ? playMatch(a, b, cfg.bestOfSemi, rng).winner.id
        : // No third-place match means third place is never actually
          // decided. Splitting it evenly between the two beaten
          // semifinalists at least keeps the estimate unbiased; taking a
          // fixed bracket slot would hand it to whoever drew the top half.
          (rng() < 0.5 ? a.id : b.id);
    }
  } else if (semiLosers.length === 1) {
    third = semiLosers[0]!;
  }

  return { champion, runnerUp, third, reached };
}

/** Group draw: the fixed one when it has happened, otherwise a fresh shuffle. */
function drawGroups(
  players: SimPlayer[],
  cfg: SimConfig,
  rng: () => number,
  draw: string[][] | null
): SimPlayer[][] {
  if (draw) {
    const byId = new Map(players.map((p) => [p.id, p]));
    return draw.map((g) => g.map((id) => byId.get(id)!).filter(Boolean));
  }
  // Mirrors PlayerService.autoAssignRandom: shuffle, then deal round-robin.
  const groupCount = Math.max(1, Math.floor(cfg.groupCount) || 1);
  const pool = shuffle(players.slice(), rng);
  const groups: SimPlayer[][] = Array.from({ length: groupCount }, () => []);
  pool.forEach((p, i) => groups[i % groupCount]!.push(p));
  return groups;
}

/**
 * First playoff round, cross-seeded exactly as the live tournament seeds it.
 * Formats the real seeder does not support (an odd number of groups, more
 * than two advancers from four groups) fall back to a seeded bracket with
 * byes, so the simulation still runs instead of throwing at request time.
 */
function openingRound(
  advancers: GroupAdvancers[],
  byId: Map<string, SimPlayer>
): (SimPlayer | null)[] {
  let seeded: BracketMatch[] | null = null;
  try {
    seeded = seedBracket(advancers);
  } catch {
    seeded = null;
  }
  if (seeded) {
    return seeded
      .slice()
      .sort((a, b) => a.bracketPosition - b.bracketPosition)
      .flatMap((m) => [byId.get(m.playerAId) ?? null, byId.get(m.playerBId) ?? null]);
  }

  // Fallback: interleave by group placing (all group winners, then all
  // runners-up, …) and lay them out in classic seed order, keeping byes so
  // the rounds stay powers of two.
  const flat: SimPlayer[] = [];
  const depth = Math.max(0, ...advancers.map((g) => g.players.length));
  for (let rank = 0; rank < depth; rank++) {
    for (const g of advancers) {
      const id = g.players[rank];
      const p = id ? byId.get(id) : undefined;
      if (p) flat.push(p);
    }
  }
  if (flat.length < 2) return flat;

  let n = 1;
  while (n < flat.length) n *= 2;
  const slots: (SimPlayer | null)[] = flat.slice();
  while (slots.length < n) slots.push(null);
  let order = [0];
  for (let size = 1; size < n; size *= 2) {
    const nextOrder: number[] = [];
    for (const s of order) {
      nextOrder.push(s);
      nextOrder.push(size * 2 - 1 - s);
    }
    order = nextOrder;
  }
  return order.map((i) => slots[i] ?? null);
}

interface MatchResult {
  winner: SimPlayer;
  loser: SimPlayer;
  winnerLegs: number;
  loserLegs: number;
}

// first to ceil(bestOf/2) legs; each leg won by A with winProbability(elo)
function playMatch(
  a: SimPlayer,
  b: SimPlayer,
  bestOf: number,
  rng: () => number
): MatchResult {
  // Configs written before a length was configurable can arrive without
  // one; a NaN target would end the match at 0:0.
  const legs = Number.isFinite(bestOf) && bestOf >= 1 ? bestOf : 3;
  const need = Math.max(1, Math.ceil(legs / 2));
  const pA = winProbability(a.eloRating, b.eloRating);
  let wa = 0;
  let wb = 0;
  while (wa < need && wb < need) {
    if (rng() < pA) wa++;
    else wb++;
  }
  return wa >= need
    ? { winner: a, loser: b, winnerLegs: wa, loserLegs: wb }
    : { winner: b, loser: a, winnerLegs: wb, loserLegs: wa };
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
