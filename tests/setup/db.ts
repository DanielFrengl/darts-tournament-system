import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";
import { sql } from "drizzle-orm";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://darts:darts@localhost:5434/darts_test";

const client = postgres(TEST_DB_URL, { max: 1 });
export const testDb = drizzle(client, { schema });

export async function setupTestDb() {
  await migrate(testDb, { migrationsFolder: "./src/db/migrations" });
}

export async function truncateAll() {
  await testDb.execute(
    sql`TRUNCATE TABLE bets, market_selections, markets, transactions, legs, matches, players, groups, tournaments, users CASCADE`
  );
}

export async function teardownTestDb() {
  await client.end();
}
