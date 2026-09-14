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

const POINTS = {
  win2_0: 3,
  win2_1: 2,
  loss1_2: 1,
  loss0_2: 0,
};

export function computeStandings(
  playerIds: string[],
  finished: FinishedMatch[]
): StandingRow[] {
  const idSet = new Set(playerIds);
  const rows = new Map<string, StandingRow>();
  for (const id of playerIds) {
    rows.set(id, {
      playerId: id,
      played: 0,
      won: 0,
      lost: 0,
      points: 0,
      legsFor: 0,
      legsAgainst: 0,
      legDiff: 0,
    });
  }

  for (const m of finished) {
    if (!idSet.has(m.playerAId) || !idSet.has(m.playerBId)) continue;
    const a = rows.get(m.playerAId)!;
    const b = rows.get(m.playerBId)!;
    a.played++;
    b.played++;
    a.legsFor += m.scoreA;
    a.legsAgainst += m.scoreB;
    b.legsFor += m.scoreB;
    b.legsAgainst += m.scoreA;
    if (m.scoreA > m.scoreB) {
      a.won++;
      b.lost++;
      a.points += m.scoreB === 0 ? POINTS.win2_0 : POINTS.win2_1;
      b.points += m.scoreB === 0 ? POINTS.loss0_2 : POINTS.loss1_2;
    } else {
      b.won++;
      a.lost++;
      b.points += m.scoreA === 0 ? POINTS.win2_0 : POINTS.win2_1;
      a.points += m.scoreA === 0 ? POINTS.loss0_2 : POINTS.loss1_2;
    }
  }

  for (const row of rows.values()) {
    row.legDiff = row.legsFor - row.legsAgainst;
  }

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

  return [...rows.values()].sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    if (y.legDiff !== x.legDiff) return y.legDiff - x.legDiff;
    return h2h(x, y);
  });
}
