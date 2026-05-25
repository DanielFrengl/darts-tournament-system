import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// SSL handling:
//  - If the connection string already specifies sslmode, let `postgres` parse it.
//  - On Railway internal hostnames (`*.railway.internal`), SSL is unnecessary.
//  - In production with a public host, default to require SSL.
//  - PGSSLMODE=disable forces it off (e.g. local docker).
function resolveSsl(
  connectionString: string
): "require" | false | undefined | { rejectUnauthorized: boolean } {
  if (process.env.PGSSLMODE === "disable") return false;
  if (/[?&]sslmode=/i.test(connectionString)) return { rejectUnauthorized: false };
  if (/\.railway\.internal/i.test(connectionString)) return false;
  if (/localhost|127\.0\.0\.1/i.test(connectionString)) return false;
  if (process.env.NODE_ENV === "production") return { rejectUnauthorized: false };
  return false;
}

// True when we're talking to a pooled proxy (e.g. Railway's public proxy)
// that doesn't support prepared statements.
function usesProxy(connectionString: string): boolean {
  return /\.proxy\.rlwy\.net/i.test(connectionString);
}

// Lazy singleton so `next build`'s page-data collection doesn't crash
// when DATABASE_URL is unset in the build environment.
let _db: PostgresJsDatabase<typeof schema> | null = null;

function getDb(): PostgresJsDatabase<typeof schema> {
  if (_db) return _db;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL must be set");
  const queryClient = postgres(connectionString, {
    max: 10,
    ssl: resolveSsl(connectionString),
    prepare: !usesProxy(connectionString),
  });
  _db = drizzle(queryClient, { schema });
  return _db;
}

export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = real[prop as keyof typeof real];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export type DB = PostgresJsDatabase<typeof schema>;
