// Standalone migration runner used in production deployments.
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL is not set in the runtime environment.");
  console.error("  Set it on the app service in Railway → Variables.");
  process.exit(1);
}

// Mask password for logging.
const safeUrl = url.replace(/:\/\/([^:]+):[^@]+@/, "://$1:****@");
console.log(`→ Connecting to: ${safeUrl}`);

function resolveSsl(connectionString) {
  if (process.env.PGSSLMODE === "disable") return false;
  if (/\.railway\.internal/i.test(connectionString)) return false;
  if (/localhost|127\.0\.0\.1/i.test(connectionString)) return false;
  // Permissive SSL: encrypt but skip cert chain verification.
  // Railway's public proxy uses certs that can fail strict verification.
  return { rejectUnauthorized: false };
}

const sql = postgres(url, {
  max: 1,
  onnotice: () => {},
  ssl: resolveSsl(url),
  connect_timeout: 30,
  idle_timeout: 5,
  // Railway's public proxy pools connections in transaction mode,
  // which breaks prepared statements. Disable them for the migrator.
  prepare: false,
});

const MAX_ATTEMPTS = 5;
let lastErr;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    console.log(`→ Migration attempt ${attempt}/${MAX_ATTEMPTS}`);
    await migrate(drizzle(sql), { migrationsFolder: "./src/db/migrations" });
    console.log("✓ Migrations applied");
    await sql.end({ timeout: 5 });
    process.exit(0);
  } catch (err) {
    lastErr = err;
    console.error(`✗ Attempt ${attempt} failed:`);
    console.error(`  message: ${err?.message}`);
    console.error(`  code: ${err?.code ?? err?.cause?.code}`);
    console.error(`  errno: ${err?.errno ?? err?.cause?.errno}`);
    console.error(`  cause: ${err?.cause?.message ?? "(none)"}`);
    if (err?.cause?.stack) console.error(`  cause stack:\n${err.cause.stack}`);
    if (attempt < MAX_ATTEMPTS) {
      const delay = attempt * 2000;
      console.log(`  retrying in ${delay}ms…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

console.error("✗ Migration failed after all retries:", lastErr);
await sql.end({ timeout: 5 }).catch(() => {});
process.exit(1);
