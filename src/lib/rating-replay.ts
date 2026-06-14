import { updateRatings, DEFAULT_RATING } from "@/lib/elo";

export interface ReplayMatch {
  winner: string;
  loser: string;
}

/**
 * Replays matches in the given order, starting everyone at 1500.
 * Names not in `names` are seeded at 1500 on first appearance.
 * Returns final rating per competitor name.
 */
export function replayElo(
  names: string[],
  matches: ReplayMatch[]
): Record<string, number> {
  const r: Record<string, number> = {};
  for (const n of names) r[n] = DEFAULT_RATING;
  for (const m of matches) {
    const wr = r[m.winner] ?? DEFAULT_RATING;
    const lr = r[m.loser] ?? DEFAULT_RATING;
    const { nextA, nextB } = updateRatings(wr, lr, "A");
    r[m.winner] = nextA;
    r[m.loser] = nextB;
  }
  return r;
}
