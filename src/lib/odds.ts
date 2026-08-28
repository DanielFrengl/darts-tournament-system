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

/** Fallbacks used when a tournament config predates these knobs. */
export const DEFAULT_MIN_ODDS = 1.1;
export const DEFAULT_MAX_ODDS = 25;
export const DEFAULT_MONEY_WEIGHT = 0.5;

/**
 * How much the money in the pool is allowed to speak, in [0, maxWeight].
 *
 * An empty book carries no information, so it starts at 0 — the price is
 * purely what the ratings say. Confidence grows linearly with the pool until
 * `threshold`, past which the money has said all it is going to say and the
 * weight sits at `maxWeight`.
 *
 * `maxWeight` below 1 is the whole point: the ratings keep a permanent share
 * of the price, so no single stake can take the book over. At the default
 * 0.5 the model and the money are equal partners once the pool is deep.
 */
export function moneyWeight(
  totalPool: number,
  threshold: number,
  maxWeight: number
): number {
  const cap = Math.min(Math.max(maxWeight, 0), 1);
  if (!(totalPool > 0)) return 0;
  if (!(threshold > 0)) return cap;
  return cap * Math.min(totalPool / threshold, 1);
}

/**
 * The market's probability for every selection, given what the ratings think
 * and where the money went.
 *
 *   p = w · (stake on this selection / whole pool) + (1 - w) · p_model
 *
 * This is the honest version of what the odds are claiming. Prices are
 * derived from a probability the book actually believes, rather than from
 * the payout ratio of the pool, and the result is coherent by construction:
 * the published probabilities sum to 1, so the book can't offer two prices
 * that contradict each other.
 *
 * It is also what keeps a lopsided book sane. A parimutuel payout ratio is
 * unbounded — one big stake on one side sends the other side's price to the
 * moon, which is correct for a real tote (the winners genuinely split the
 * pool) but wrong here, where payouts are credited rather than shared out.
 * Because `p` can never fall below `(1 - w) · p_model`, the price can never
 * rise above `p_model / (1 - w)` times fair: at w = 0.5, money can at most
 * double the odds, however much of it turns up.
 *
 * Model probabilities are renormalised first — they are recovered from
 * stored odds that were rounded and clamped, so they don't quite sum to 1.
 */
export function marketProbabilities(
  modelProbabilities: number[],
  pools: number[],
  weight: number
): number[] {
  if (modelProbabilities.length !== pools.length) {
    throw new Error("modelProbabilities and pools must be the same length");
  }
  if (modelProbabilities.length === 0) return [];

  const modelSum = modelProbabilities.reduce((a, b) => a + b, 0);
  const n = modelProbabilities.length;
  const model =
    modelSum > 0
      ? modelProbabilities.map((p) => p / modelSum)
      : modelProbabilities.map(() => 1 / n);

  const totalPool = pools.reduce((a, b) => a + b, 0);
  const w = totalPool > 0 ? Math.min(Math.max(weight, 0), 1) : 0;
  if (w === 0) return model;

  return model.map((p, i) => w * (pools[i]! / totalPool) + (1 - w) * p);
}

/**
 * Hold odds inside a sane band. The floor matters most: a price below 1.0
 * would mean a winning bet pays back less than it cost. The ceiling is a
 * backstop for a degenerate model probability — with the money weight
 * capped, ordinary lopsided books no longer reach it.
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
 * unusable, so callers can skip it rather than crash.
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
 * Convert a probability into decimal odds after a house edge.
 *   odds = (1 / probability) * (1 - houseEdge)
 *
 * houseEdge=0 gives fair odds. Throws if p is 0 or 1 (degenerate).
 */
export function probabilityToOdds(p: number, houseEdge: number): number {
  if (p <= 0 || p >= 1) throw new Error("probability must be in (0,1)");
  return (1 / p) * (1 - houseEdge);
}
