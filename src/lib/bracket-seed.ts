// Pure cross-seeding rules for the playoff bracket. No DB, no IO — the live
// tournament and the Monte Carlo simulation both build their bracket from
// here, so a simulated playoff has the same shape as the real one.

export type BracketPhase = "quarter" | "semi" | "final";

export type GroupAdvancers = { groupName: string; players: string[] };

export type BracketMatch = {
  phase: BracketPhase;
  bracketRound: number;
  bracketPosition: number;
  playerAId: string;
  playerBId: string;
};

export const PHASE_BY_REMAINING: Record<number, BracketPhase> = {
  2: "final",
  4: "semi",
  8: "quarter",
};

/**
 * Quarterfinal winners are paired into semifinals by adjacent bracket
 * position: positions 0 & 1 feed semifinal 0, positions 2 & 3 feed
 * semifinal 1 (see `BracketService.advanceWinner`). So the semifinal a
 * quarterfinal slot eventually reaches is `position / 2`.
 */
export const semifinalOfQuarter = (bracketPosition: number): number =>
  Math.floor(bracketPosition / 2);

/**
 * Enforces that no group can place two of its players into the same
 * semifinal: every quarterfinal feeding a given semifinal must belong to
 * a distinct group. This guarantee is only achievable (and therefore only
 * checked) when there are at least 4 groups — with 2 groups each half of
 * an 8-player bracket unavoidably contains both groups.
 *
 * Acts as a structural backstop: any future change to the seeding pattern
 * that would let group-mates meet in a semifinal fails loudly here.
 */
function assertSemifinalGroupSeparation(
  bracket: BracketMatch[],
  groupOfPlayer: Map<string, string>
): void {
  const groupsBySemifinal = new Map<number, Set<string>>();
  for (const m of bracket) {
    const semifinal = semifinalOfQuarter(m.bracketPosition);
    const seen = groupsBySemifinal.get(semifinal) ?? new Set<string>();
    for (const playerId of [m.playerAId, m.playerBId]) {
      const group = groupOfPlayer.get(playerId);
      if (group === undefined) continue;
      if (seen.has(group)) {
        throw new Error(
          `seeding error: two players from group "${group}" can reach semifinal ${semifinal}`
        );
      }
      seen.add(group);
    }
    groupsBySemifinal.set(semifinal, seen);
  }
}

/**
 * Cross-seeded bracket generator. Builds only the first round of the
 * bracket; subsequent rounds are created when winners are advanced.
 *
 * For 2 groups: pairing pattern is A1 vs B(N), B1 vs A(N), A2 vs B(N-1), ...
 */
export function seedBracket(advancers: GroupAdvancers[]): BracketMatch[] {
  const total = advancers.reduce((acc, g) => acc + g.players.length, 0);
  if (total < 2) throw new Error("need at least 2 advancers");
  if (total % 2 !== 0) throw new Error("total advancers must be even");
  if ((total & (total - 1)) !== 0) {
    throw new Error("total advancers must be a power of 2");
  }
  const phase = PHASE_BY_REMAINING[total];
  if (!phase) throw new Error("unsupported bracket size");

  if (advancers.length === 1) {
    // Single-group format: the two qualifiers play directly in the final.
    const only = advancers[0]!;
    if (only.players.length !== 2) {
      throw new Error("single-group brackets must advance exactly 2 players");
    }
    return [
      {
        phase,
        bracketRound: 1,
        bracketPosition: 0,
        playerAId: only.players[0]!,
        playerBId: only.players[1]!,
      },
    ];
  }

  if (advancers.length !== 2 && advancers.length !== 4) {
    throw new Error("only 1, 2 or 4 group brackets are supported in this phase");
  }

  const out: BracketMatch[] = [];

  if (advancers.length === 4) {
    const [a, b, c, d] = advancers;
    const perGroup = a!.players.length;
    if (b!.players.length !== perGroup || c!.players.length !== perGroup || d!.players.length !== perGroup) {
      throw new Error("groups must advance the same number of players");
    }

    if (perGroup === 1) {
      // 4 advancers (semi)
      out.push({ phase, bracketRound: 1, bracketPosition: 0, playerAId: a!.players[0]!, playerBId: c!.players[0]! });
      out.push({ phase, bracketRound: 1, bracketPosition: 1, playerAId: b!.players[0]!, playerBId: d!.players[0]! });
    } else if (perGroup === 2) {
      // 8 advancers (quarter)
      out.push({ phase, bracketRound: 1, bracketPosition: 0, playerAId: a!.players[0]!, playerBId: b!.players[1]! });
      out.push({ phase, bracketRound: 1, bracketPosition: 1, playerAId: c!.players[0]!, playerBId: d!.players[1]! });
      out.push({ phase, bracketRound: 1, bracketPosition: 2, playerAId: b!.players[0]!, playerBId: a!.players[1]! });
      out.push({ phase, bracketRound: 1, bracketPosition: 3, playerAId: d!.players[0]!, playerBId: c!.players[1]! });
    } else {
      throw new Error("only up to 2 advancers per group are supported for 4 groups currently");
    }
    // With >= 4 groups the seeding must keep group-mates out of the same
    // semifinal. Enforce it structurally so a future pattern change can't
    // silently break it.
    const groupOfPlayer = new Map<string, string>();
    for (const g of advancers) {
      for (const pid of g.players) groupOfPlayer.set(pid, g.groupName);
    }
    assertSemifinalGroupSeparation(out, groupOfPlayer);
    return out;
  }

  const [a, b] = advancers as [GroupAdvancers, GroupAdvancers];
  const perGroup = a.players.length;
  if (b.players.length !== perGroup) {
    throw new Error("groups must advance the same number of players");
  }

  const half = Math.ceil(perGroup / 2);
  for (let i = 0; i < half; i++) {
    const aSeed = a.players[i]!;
    const bAnti = b.players[perGroup - 1 - i]!;
    out.push({
      phase,
      bracketRound: 1,
      bracketPosition: out.length,
      playerAId: aSeed,
      playerBId: bAnti,
    });
    if (i !== perGroup - 1 - i) {
      const bSeed = b.players[i]!;
      const aAnti = a.players[perGroup - 1 - i]!;
      out.push({
        phase,
        bracketRound: 1,
        bracketPosition: out.length,
        playerAId: bSeed,
        playerBId: aAnti,
      });
    }
  }
  return out;
}
