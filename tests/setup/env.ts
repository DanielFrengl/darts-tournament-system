import { vi } from "vitest";

// Pick up TEST_DATABASE_URL from .env — vitest does not load it by itself.
try {
  process.loadEnvFile();
} catch {
  // no .env file; fall back to defaults below
}

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://darts:darts@localhost:5434/darts_test";
process.env.AUTH_SECRET ??= "test-secret";
process.env.AUTH_URL ??= "http://localhost:3000";
process.env.UPLOADTHING_TOKEN ??= "test-token";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
