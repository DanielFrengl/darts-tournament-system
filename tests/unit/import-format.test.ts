import { describe, it, expect } from "vitest";
import {
  parseTournamentExport,
  type TournamentExport,
} from "@/lib/import-format";

const sample: TournamentExport = {
  tournamentName: "Jabloňová Open #3",
  legs: "2,3,3,5",
  groups: "Anežka,Matyáš,Dan,Bohy|Radim,Adam,Kovy,David",
  odds: "Anežka:30.0|Dan:5.0",
  scores:
    "Anežka-Matyáš=2:0|Matyáš-Anežka=0:2|Radim-David=0:2|David-Kovy=2:0",
};

describe("parseTournamentExport", () => {
  it("flattens both groups into players", () => {
    const p = parseTournamentExport(sample);
    expect(p.players).toHaveLength(8);
    expect(p.players).toContain("Anežka");
    expect(p.players).toContain("David");
  });

  it("parses scores into directed matches", () => {
    const p = parseTournamentExport(sample);
    expect(p.matches).toHaveLength(4);
    expect(p.matches[0]).toEqual({
      a: "Anežka",
      b: "Matyáš",
      scoreA: 2,
      scoreB: 0,
    });
  });

  it("keeps the tournament name", () => {
    expect(parseTournamentExport(sample).name).toBe("Jabloňová Open #3");
  });
});
