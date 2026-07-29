/**
 * Pure odds math. No DB, no IO. Easy to test, easy to reason about.
 */

/**
 * Probability distribution over possible final scores given:
 *   - pA: probability that player A wins any given leg
 *   - bestOf: odd number, first to ceil(bestOf/2)
 *
 * Returns map keyed by "scoreA:scoreB" string. Built by enumerating
 * all distinct paths through the leg sequence:
 *   For player A to win N:K (K < N), there must be exactly N+K legs,
 *   the last leg goes to A, and K of the prior N+K-1 go to B.
 *   P = C(N+K-1, K) * pA^N * (1-pA)^K
 */
export function correctScoreDistribution(
  pA: number,
  bestOf: number
): Map<string, number> {
  if (bestOf % 2 === 0) throw new Error("bestOf must be odd");
  if (pA < 0 || pA > 1) throw new Error("pA must be in [0,1]");
  const target = Math.ceil(bestOf / 2);
  const out = new Map<string, number>();
  const pB = 1 - pA;

  for (let losses = 0; losses < target; losses++) {
    const totalLegs = target + losses;
    const choose = binom(totalLegs - 1, losses);
    const pAWin = choose * Math.pow(pA, target) * Math.pow(pB, losses);
    out.set(`${target}:${losses}`, pAWin);
  }
  for (let losses = 0; losses < target; losses++) {
    const totalLegs = target + losses;
    const choose = binom(totalLegs - 1, losses);
    const pBWin = choose * Math.pow(pB, target) * Math.pow(pA, losses);
    out.set(`${losses}:${target}`, pBWin);
  }
  return out;
}

function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let acc = 1;
  for (let i = 1; i <= k; i++) acc = (acc * (n - k + i)) / i;
  return acc;
}

/**
 * Parimutuel payout odds.
 *   totalPool = sum of all stakes in this market
 *   poolOnSelection = sum of stakes backing the selected outcome
 *   rake = house take fraction in [0, 0.2]
 *
 * Returns null when no money is on the selection (undefined odds).
 */
export function parimutuelOdds(
  totalPool: number,
  poolOnSelection: number,
  rake: number
): number | null {
  if (poolOnSelection <= 0) return null;
  return (totalPool * (1 - rake)) / poolOnSelection;
}

/** Fallbacks used when a tournament config predates the balancing knobs. */
export const DEFAULT_ODDS_SEED_POOL = 500;
export const DEFAULT_MIN_ODDS = 1.1;
export const DEFAULT_MAX_ODDS = 25;

/**
 * Parimutuel odds with a virtual seed pool, so a lopsided book can't push
 * one side to ~1.00 while the other explodes.
 *
 * Each selection is treated as if the house already staked
 * `seedPool * probability` on it. That has two useful properties:
 *
 *   - with no real money, poolOnSelection = 0 and the formula collapses to
 *     seedPool / (seedPool * p) = 1/p, i.e. exactly the statistical odds
 *   - as the real pool grows past seedPool, the seed washes out and it
 *     converges on the plain parimutuel result
 *
 * So odds now drift from ELO-implied toward money-implied instead of
 * jumping the moment the first big bet lands. `probability` is the
 * selection's modelled win chance in (0,1].
 *
 * Falls back to plain parimutuel when seedPool <= 0.
 */
export function seededParimutuelOdds(
  totalPool: number,
  poolOnSelection: number,
  probability: number,
  seedPool: number,
  rake: number
): number | null {
  if (seedPool <= 0) return parimutuelOdds(totalPool, poolOnSelection, rake);
  if (probability <= 0 || probability > 1) {
    throw new Error("probability must be in (0,1]");
  }
  const effectiveTotal = totalPool + seedPool;
  const effectiveSelection = poolOnSelection + seedPool * probability;
  if (effectiveSelection <= 0) return null;
  return (effectiveTotal * (1 - rake)) / effectiveSelection;
}

/**
 * Hold odds inside a sane band. The floor matters most: raw parimutuel
 * can return < 1.0, which would mean a winning bet pays back less than it
 * cost. The ceiling stops a near-empty side showing a fantasy payout.
 */
export function clampOdds(
  odds: number,
  minOdds: number,
  maxOdds: number
): number {
  if (maxOdds < minOdds) throw new Error("maxOdds must be >= minOdds");
  // NaN has no position on the band, so fail safe to the floor. Infinity
  // does have one, and clamps to the ceiling like any other huge number.
  if (Number.isNaN(odds)) return minOdds;
  return Math.min(maxOdds, Math.max(minOdds, odds));
}

/**
 * Recover a selection's modelled probability from its stored stat odds.
 * Inverse of probabilityToOdds. Returns null when the stored value is
 * unusable, so callers can skip seeding rather than crash.
 */
export function probabilityFromOdds(
  statOdds: number,
  houseEdge: number
): number | null {
  if (!Number.isFinite(statOdds) || statOdds <= 0) return null;
  const p = (1 - houseEdge) / statOdds;
  if (!Number.isFinite(p) || p <= 0 || p > 1) return null;
  return p;
}

/**
 * Blend statistical odds with parimutuel odds using a linear weight
 * that scales from 0 (no money in pool) to 1 (pool >= threshold).
 *   alpha = min(totalPool / threshold, 1)
 *   final = alpha * pari + (1 - alpha) * stat
 *
 * If pariOdds is null (no money on selection), falls back to statOdds.
 */
export function blendOdds(
  statOdds: number,
  pariOdds: number | null,
  totalPool: number,
  threshold: number
): number {
  if (pariOdds === null) return statOdds;
  if (threshold <= 0) return pariOdds;
  const alpha = Math.min(totalPool / threshold, 1);
  return alpha * pariOdds + (1 - alpha) * statOdds;
}

/**
 * Convert a probability into decimal odds after a house edge.
 *   odds = (1 / probability) * (1 - houseEdge)
 *
 * houseEdge=0 gives fair odds. Throws if p is 0 or 1 (degenerate).
 */
export function probabilityToOdds(p: number, houseEdge: number): number {
  if (p <= 0 || p >= 1) throw new Error("probability must be in (0,1)");
  return (1 / p) * (1 - houseEdge);
}
