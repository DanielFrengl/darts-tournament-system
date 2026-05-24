import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";
import { sql } from "drizzle-orm";

const TEST_DB_URL = "postgres://darts:darts@localhost:5433/darts_test";

const client = postgres(TEST_DB_URL, { max: 1 });
export const testDb = drizzle(client, { schema });

export async function setupTestDb() {
  await migrate(testDb, { migrationsFolder: "./src/db/migrations" });
}

export async function truncateAll() {
  await testDb.execute(
    sql`TRUNCATE TABLE transactions, users RESTART IDENTITY CASCADE`
  );
}

export async function teardownTestDb() {
  await client.end();
}
