// Parser for the "Jabloňová Open" tournament export JSON format:
//   { tournamentName, legs, groups: "A,B|C,D", odds, scores: "A-B=2:0|..." }
// Player names must not contain "-" (used as the pair separator).

export interface TournamentExport {
  tournamentName: string;
  legs?: string;
  groups: string;
  odds?: string;
  scores: string;
}

export interface ParsedMatch {
  a: string;
  b: string;
  scoreA: number;
  scoreB: number;
}

export interface ParsedTournament {
  name: string;
  players: string[];
  matches: ParsedMatch[];
}

export function parseTournamentExport(e: TournamentExport): ParsedTournament {
  const players = e.groups
    .split("|")
    .flatMap((g) => g.split(","))
    .map((s) => s.trim())
    .filter(Boolean);

  const matches: ParsedMatch[] = (e.scores ?? "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [pair, res] = s.split("=");
      if (!pair || !res) throw new Error(`bad score entry: ${s}`);
      const ab = pair.split("-");
      const a = ab[0]?.trim();
      const b = ab[1]?.trim();
      const sc = res.split(":");
      const scoreA = Number(sc[0]);
      const scoreB = Number(sc[1]);
      if (!a || !b || Number.isNaN(scoreA) || Number.isNaN(scoreB))
        throw new Error(`bad score entry: ${s}`);
      return { a, b, scoreA, scoreB };
    });

  return { name: e.tournamentName, players, matches };
}
