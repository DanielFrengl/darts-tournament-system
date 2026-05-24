export const DEFAULT_K = 32;
export const DEFAULT_RATING = 1500;

/**
 * Classic ELO win probability: 1 / (1 + 10^((rB - rA) / 400)).
 */
export function winProbability(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function updateRatings(
  ratingA: number,
  ratingB: number,
  winner: "A" | "B",
  k: number = DEFAULT_K
): { nextA: number; nextB: number } {
  const expectedA = winProbability(ratingA, ratingB);
  const expectedB = 1 - expectedA;
  const actualA = winner === "A" ? 1 : 0;
  const actualB = 1 - actualA;
  return {
    nextA: Math.round(ratingA + k * (actualA - expectedA)),
    nextB: Math.round(ratingB + k * (actualB - expectedB)),
  };
}
