import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error — plain .mjs fixture, no types
import { seedLiveBetting } from "./fixtures/seed-live-betting.mjs";

// Minimal .env loader — the Playwright process (unlike `next dev`) does not
// auto-load .env, but we need DATABASE_URL to seed the fixture.
function loadEnv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

export default async function globalSetup() {
  loadEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL must be set to seed e2e fixtures");
  }
  const fixture = await seedLiveBetting(connectionString);
  writeFileSync(
    join(process.cwd(), "tests/e2e/.fixture.json"),
    JSON.stringify(fixture, null, 2)
  );
  console.log(`[e2e] seeded live-betting fixture (match ${fixture.matchId})`);
}
