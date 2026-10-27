// Pure group-standings math. No DB, no IO — so the Monte Carlo simulation
// can rank its simulated groups by exactly the same rules the live
// tournament uses.

export type FinishedMatch = {
  playerAId: string;
  playerBId: string;
  scoreA: number;
  scoreB: number;
};

export type StandingRow = {
  playerId: string;
  played: number;
  won: number;
  lost: number;
  points: number;
  legsFor: number;
  legsAgainst: number;
  legDiff: number;
};

/**
 * How a group awards points.
 *
 *   win_only           a win is 3, a loss is 0, whatever the scoreline
 *   clean_sweep_bonus  3 for a win where the loser took no leg, 2 otherwise;
 *                      1 for a loss with at least one leg, 0 without
 *
 * Tournaments created before this was configurable have no value stored, so
 * the resolver below keeps them on `clean_sweep_bonus` — a tournament's table
 * must not change its own rules part-way through.
 */
export type GroupScoring = "win_only" | "clean_sweep_bonus";

export const DEFAULT_GROUP_SCORING: GroupScoring = "clean_sweep_bonus";

export function resolveGroupScoring(value: unknown): GroupScoring {
  return value === "win_only" || value === "clean_sweep_bonus"
    ? value
    : DEFAULT_GROUP_SCORING;
}

/** Points for [winner, loser] given the legs each took. */
function award(
  scoring: GroupScoring,
  loserLegs: number
): [winner: number, loser: number] {
  if (scoring === "win_only") return [3, 0];
  return loserLegs === 0 ? [3, 0] : [2, 1];
}

function blankRow(playerId: string): StandingRow {
  return {
    playerId,
    played: 0,
    won: 0,
    lost: 0,
    points: 0,
    legsFor: 0,
    legsAgainst: 0,
    legDiff: 0,
  };
}

/**
 * Tally the given matches without ranking. Used twice: once over the whole
 * group, and again over just the players tied on points, to settle the tie
 * on their results against each other.
 */
function tally(
  playerIds: string[],
  finished: FinishedMatch[],
  scoring: GroupScoring
): Map<string, StandingRow> {
  const rows = new Map<string, StandingRow>();
  for (const id of playerIds) rows.set(id, blankRow(id));

  for (const m of finished) {
    const a = rows.get(m.playerAId);
    const b = rows.get(m.playerBId);
    if (!a || !b) continue;
    a.played++;
    b.played++;
    a.legsFor += m.scoreA;
    a.legsAgainst += m.scoreB;
    b.legsFor += m.scoreB;
    b.legsAgainst += m.scoreA;

    const aWon = m.scoreA > m.scoreB;
    const winner = aWon ? a : b;
    const loser = aWon ? b : a;
    const [winPts, lossPts] = award(scoring, aWon ? m.scoreB : m.scoreA);
    winner.won++;
    loser.lost++;
    winner.points += winPts;
    loser.points += lossPts;
  }

  for (const row of rows.values()) {
    row.legDiff = row.legsFor - row.legsAgainst;
  }
  return rows;
}

export function computeStandings(
  playerIds: string[],
  finished: FinishedMatch[],
  scoring: GroupScoring = DEFAULT_GROUP_SCORING
): StandingRow[] {
  const inGroup = new Set(playerIds);
  const relevant = finished.filter(
    (m) => inGroup.has(m.playerAId) && inGroup.has(m.playerBId)
  );
  const rows = tally(playerIds, relevant, scoring);
  const table = playerIds
    .map((id) => rows.get(id))
    .filter((r): r is StandingRow => !!r);

  if (scoring === "clean_sweep_bonus") {
    return rankLegacy(table, relevant);
  }
  return rankByHeadToHead(table, relevant, scoring);
}

/**
 * The original ranking: points, then overall leg difference, then the direct
 * result. Kept verbatim for tournaments already under way on it.
 *
 * Note this uses the direct result as a plain comparator, which isn't a
 * transitive sort key — fine for the two-player ties it was written for.
 */
function rankLegacy(
  table: StandingRow[],
  finished: FinishedMatch[]
): StandingRow[] {
  const h2h = (x: StandingRow, y: StandingRow): number => {
    const direct = finished.find(
      (m) =>
        (m.playerAId === x.playerId && m.playerBId === y.playerId) ||
        (m.playerAId === y.playerId && m.playerBId === x.playerId)
    );
    if (!direct) return 0;
    const xWon =
      (direct.playerAId === x.playerId && direct.scoreA > direct.scoreB) ||
      (direct.playerBId === x.playerId && direct.scoreB > direct.scoreA);
    return xWon ? -1 : 1;
  };

  return [...table].sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    if (y.legDiff !== x.legDiff) return y.legDiff - x.legDiff;
    return h2h(x, y);
  });
}

/**
 * Points first, then the players tied on points are separated by how they did
 * against each other, then by overall leg difference and legs won.
 *
 * The tie is settled with a mini-table over only the matches between the tied
 * players, rather than by comparing them pair by pair. For two players that
 * comes to the same thing — whoever won the direct match goes above — but it
 * also resolves a three-way tie, where pairwise comparison can be circular
 * (A beat B, B beat C, C beat A) and gives an order that depends on which
 * pairs the sort happened to compare.
 *
 * Players still level after every criterion keep the order they came in, which
 * is the roster order, so the table is at least stable between renders.
 */
function rankByHeadToHead(
  table: StandingRow[],
  finished: FinishedMatch[],
  scoring: GroupScoring
): StandingRow[] {
  const clusters = new Map<number, StandingRow[]>();
  for (const row of table) {
    const arr = clusters.get(row.points) ?? [];
    arr.push(row);
    clusters.set(row.points, arr);
  }

  const ordered: StandingRow[] = [];
  for (const points of [...clusters.keys()].sort((a, b) => b - a)) {
    const cluster = clusters.get(points)!;
    if (cluster.length === 1) {
      ordered.push(cluster[0]!);
      continue;
    }

    const tiedIds = cluster.map((r) => r.playerId);
    const tiedSet = new Set(tiedIds);
    const amongTied = finished.filter(
      (m) => tiedSet.has(m.playerAId) && tiedSet.has(m.playerBId)
    );
    const mini = tally(tiedIds, amongTied, scoring);

    ordered.push(
      ...[...cluster].sort((x, y) => {
        const mx = mini.get(x.playerId)!;
        const my = mini.get(y.playerId)!;
        if (my.points !== mx.points) return my.points - mx.points;
        if (my.legDiff !== mx.legDiff) return my.legDiff - mx.legDiff;
        if (y.legDiff !== x.legDiff) return y.legDiff - x.legDiff;
        return y.legsFor - x.legsFor;
      })
    );
  }
  return ordered;
}
