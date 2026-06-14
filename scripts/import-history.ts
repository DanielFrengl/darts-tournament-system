// Historical tournament importer + Elo replay.
// Usage: npm run import-history data/history.json
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { replayElo, type ReplayMatch } from "../src/lib/rating-replay";

interface Input {
  competitors: string[];
  tournaments: {
    name: string;
    matches: { a: string; b: string; scoreA: number; scoreB: number }[];
  }[];
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: import-history <file.json>");
  const input = JSON.parse(readFileSync(file, "utf8")) as Input;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL must be set");
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    // 1. upsert competitors by displayName
    const compId: Record<string, string> = {};
    for (const name of input.competitors) {
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

    // 2. create finished tournaments + players + matches; collect ordered replay list
    const replayMatches: ReplayMatch[] = [];
    for (const t of input.tournaments) {
      const cfg = {
        groupCount: 1,
        groupSize: input.competitors.length,
        advancePerGroup: 2,
        bestOfGroup: 3,
        bestOfQuarter: 5,
        bestOfSemi: 5,
        bestOfFinal: 7,
        thirdPlaceMatch: false,
      };
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

      const namesHere = new Set<string>();
      t.matches.forEach((m) => {
        namesHere.add(m.a);
        namesHere.add(m.b);
      });
      const playerId: Record<string, string> = {};
      for (const name of namesHere) {
        const playerRows = await db
          .insert(schema.players)
          .values({
            tournamentId: tour.id,
            name,
            competitorId: compId[name],
          })
          .returning();
        playerId[name] = playerRows[0]!.id;
      }

      for (const m of t.matches) {
        const winnerName = m.scoreA >= m.scoreB ? m.a : m.b;
        const loserName = winnerName === m.a ? m.b : m.a;
        await db.insert(schema.matches).values({
          tournamentId: tour.id,
          phase: "group",
          bestOf: 3,
          playerAId: playerId[m.a]!,
          playerBId: playerId[m.b]!,
          scoreA: m.scoreA,
          scoreB: m.scoreB,
          status: "finished",
          winnerId: playerId[winnerName]!,
          finishedAt: new Date(),
        });
        replayMatches.push({ winner: winnerName, loser: loserName });
      }
    }

    // 3. replay Elo and persist onto competitors
    const finalRatings = replayElo(input.competitors, replayMatches);
    for (const name of input.competitors) {
      await db
        .update(schema.competitors)
        .set({ eloRating: Math.round(finalRatings[name] ?? 1500) })
        .where(eq(schema.competitors.id, compId[name]!));
    }

    console.log("Imported. Final ratings:");
    for (const name of input.competitors)
      console.log(`  ${name}: ${Math.round(finalRatings[name] ?? 1500)}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
