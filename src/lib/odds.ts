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
