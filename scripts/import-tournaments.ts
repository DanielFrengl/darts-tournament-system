// Import "Jabloňová Open" export-format tournaments and replay Elo into
// competitors. Pass files in CHRONOLOGICAL order (oldest first):
//   npm run import-tournaments data/open1.json data/open2.json data/open3.json
// Re-runnable: ratings always replay from 1500 (idempotent); archive
// tournament rows are only created if a tournament of that name is absent.
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import {
  parseTournamentExport,
  type TournamentExport,
  type ParsedTournament,
} from "../src/lib/import-format";
import { replayElo, type ReplayMatch } from "../src/lib/rating-replay";

function legsToConfig(legs: string | undefined, groups: string[]) {
  const raceTo = (legs ?? "2,3,3,5").split(",").map((n) => Number(n.trim()));
  const bo = (n: number | undefined) => (n && n > 0 ? n * 2 - 1 : 3); // first-to-n -> best-of
  return {
    groupCount: groups.length,
    groupSize: Math.max(...groups.map((g) => g.split(",").length)),
    advancePerGroup: 2,
    bestOfGroup: bo(raceTo[0]),
    bestOfQuarter: bo(raceTo[1]),
    bestOfSemi: bo(raceTo[2]),
    bestOfFinal: bo(raceTo[3]),
    thirdPlaceMatch: false,
    houseEdge: 0,
  };
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0)
    throw new Error("usage: import-tournaments <file1.json> [file2.json ...]");

  const parsed: { raw: TournamentExport; t: ParsedTournament }[] = files.map(
    (f) => {
      const raw = JSON.parse(readFileSync(f, "utf8")) as TournamentExport;
      return { raw, t: parseTournamentExport(raw) };
    }
  );

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL must be set");
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    // 1. unique competitors across all files
    const allNames = [...new Set(parsed.flatMap((p) => p.t.players))];
    const compId: Record<string, string> = {};
    for (const name of allNames) {
      const existing = await db
        .select()
        .from(schema.competitors)
        .where(eq(schema.competitors.displayName, name));
      if (existing[0]) {
        compId[name] = existing[0].id;
        continue;
      }
      const inserted = await db
        .insert(schema.competitors)
        .values({ displayName: name })
        .returning();
      compId[name] = inserted[0]!.id;
    }

    // 2. archive rows (skip if a tournament of that name already exists)
    for (const { raw, t } of parsed) {
      const existingT = await db
        .select({ id: schema.tournaments.id })
        .from(schema.tournaments)
        .where(eq(schema.tournaments.name, t.name));
      if (existingT[0]) {
        console.log(`• "${t.name}" already archived — skipping rows`);
        continue;
      }
      const cfg = legsToConfig(raw.legs, raw.groups.split("|"));
      const tourRows = await db
        .insert(schema.tournaments)
        .values({
          name: t.name,
          status: "finished",
          configJson: cfg,
          finishedAt: new Date(),
        })
        .returning();
      const tour = tourRows[0]!;
      const playerId: Record<string, string> = {};
      for (const name of t.players) {
        const pr = await db
          .insert(schema.players)
          .values({ tournamentId: tour.id, name, competitorId: compId[name] })
          .returning();
        playerId[name] = pr[0]!.id;
      }
      for (const m of t.matches) {
        const winnerName = m.scoreA >= m.scoreB ? m.a : m.b;
        await db.insert(schema.matches).values({
          tournamentId: tour.id,
          phase: "group",
          bestOf: cfg.bestOfGroup,
          playerAId: playerId[m.a]!,
          playerBId: playerId[m.b]!,
          scoreA: m.scoreA,
          scoreB: m.scoreB,
          status: "finished",
          winnerId: playerId[winnerName]!,
          finishedAt: new Date(),
        });
      }
      console.log(`• archived "${t.name}" (${t.matches.length} matches)`);
    }

    // 3. replay Elo over ALL matches, in file order
    const replayMatches: ReplayMatch[] = parsed.flatMap((p) =>
      p.t.matches.map((m) => {
        const winner = m.scoreA >= m.scoreB ? m.a : m.b;
        const loser = winner === m.a ? m.b : m.a;
        return { winner, loser };
      })
    );
    const finalRatings = replayElo(allNames, replayMatches);
    for (const name of allNames) {
      await db
        .update(schema.competitors)
        .set({ eloRating: Math.round(finalRatings[name] ?? 1500) })
        .where(eq(schema.competitors.id, compId[name]!));
    }

    console.log("\nFinal ratings (high → low):");
    [...allNames]
      .sort((a, b) => (finalRatings[b] ?? 0) - (finalRatings[a] ?? 0))
      .forEach((n) =>
        console.log(`  ${n.padEnd(10)} ${Math.round(finalRatings[n] ?? 1500)}`)
      );
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
