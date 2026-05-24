# Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundation of the darts tournament system: project scaffold, database with users and audit-logged capital tracking, NextAuth authentication, registration/login flows, user profile pages, avatar upload, and admin user management with audit log.

**Architecture:** Next.js 15 fullstack (App Router) with Drizzle ORM on PostgreSQL. Auth handled by NextAuth.js v5 (credentials provider, Argon2id, JWT sessions). All capital movements go through a single `CapitalService` that writes to both `users.capital` and an immutable `transactions` audit log inside one DB transaction. UI built with shadcn/ui on Tailwind v4, dark-mode default.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind v4, shadcn/ui, Drizzle ORM, PostgreSQL (Neon for prod, local Docker for dev), NextAuth.js v5, Argon2 (argon2 npm), Zod, UploadThing, Vitest, Playwright, Sonner.

**Reference spec:** `docs/superpowers/specs/2026-05-24-darts-tournament-design.md`

---

## File Structure (created in Phase 1)

```
darts-tournament-system/
├── docker-compose.yml                       — local Postgres for dev/tests
├── drizzle.config.ts                        — Drizzle migration config
├── .env.example                             — documented env vars
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── components.json                          — shadcn config
├── vitest.config.ts
├── playwright.config.ts
├── .github/workflows/ci.yml
├── src/
│   ├── db/
│   │   ├── schema.ts                        — users, transactions tables
│   │   ├── client.ts                        — Drizzle client (server-only)
│   │   └── migrations/                      — generated SQL
│   ├── lib/
│   │   ├── auth.ts                          — NextAuth config + handlers
│   │   ├── password.ts                      — Argon2id hash/verify
│   │   ├── validation.ts                    — Zod schemas
│   │   ├── capital.ts                       — CapitalService (atomic ops)
│   │   ├── uploadthing.ts                   — UploadThing core
│   │   └── utils.ts                         — cn() helper from shadcn
│   ├── app/
│   │   ├── layout.tsx                       — root layout, providers
│   │   ├── globals.css                      — Tailwind + shadcn vars
│   │   ├── page.tsx                         — public landing
│   │   ├── (auth)/
│   │   │   ├── layout.tsx
│   │   │   ├── login/page.tsx
│   │   │   ├── login/actions.ts
│   │   │   ├── register/page.tsx
│   │   │   └── register/actions.ts
│   │   ├── (app)/
│   │   │   ├── layout.tsx                   — auth-protected, sidebar
│   │   │   ├── page.tsx                     — dashboard placeholder
│   │   │   ├── settings/page.tsx
│   │   │   ├── settings/actions.ts
│   │   │   └── u/[username]/page.tsx
│   │   ├── admin/
│   │   │   ├── layout.tsx                   — admin guard
│   │   │   ├── page.tsx                     — admin dashboard
│   │   │   ├── users/page.tsx
│   │   │   ├── users/actions.ts
│   │   │   └── audit/page.tsx
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       └── uploadthing/
│   │           ├── route.ts
│   │           └── core.ts
│   ├── components/
│   │   ├── ui/                              — shadcn components (generated)
│   │   ├── auth/
│   │   │   ├── LoginForm.tsx
│   │   │   └── RegisterForm.tsx
│   │   ├── user/
│   │   │   ├── AvatarUpload.tsx
│   │   │   ├── ProfileCard.tsx
│   │   │   └── CapitalDisplay.tsx
│   │   ├── admin/
│   │   │   ├── UserList.tsx
│   │   │   ├── CapitalAdjustDialog.tsx
│   │   │   └── AuditLogTable.tsx
│   │   └── layout/
│   │       ├── Sidebar.tsx
│   │       ├── UserMenu.tsx
│   │       └── ThemeProvider.tsx
│   ├── types/
│   │   └── next-auth.d.ts                   — session augmentation
│   └── middleware.ts                        — route protection
└── tests/
    ├── setup/
    │   ├── db.ts                            — test DB setup/teardown
    │   └── factories.ts                     — user/transaction factories
    ├── unit/
    │   ├── password.test.ts
    │   ├── validation.test.ts
    │   └── capital.test.ts
    ├── integration/
    │   ├── auth.test.ts
    │   ├── capital-flow.test.ts
    │   └── admin.test.ts
    └── e2e/
        └── register-login.spec.ts
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `components.json`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/lib/utils.ts`, `.gitignore`, `.env.example`

- [ ] **Step 1: Create Next.js project in current directory**

The directory already exists with `LICENSE` and `README.md`. Initialize Next.js into it.

```bash
cd /Users/danielfrengl/darts-tournament-system
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir=false --import-alias "@/*" --no-eslint --use-npm
```

When prompted "package.json exists, overwrite?" answer **No** if asked. If it forces overwrite, accept — we'll restore README content after.

Then verify:

```bash
ls src/app
```

Expected: `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`

- [ ] **Step 2: Pin Node version and install exact deps**

Create `.nvmrc`:

```
20
```

Install runtime deps:

```bash
npm install drizzle-orm postgres @auth/drizzle-adapter next-auth@beta zod argon2 uploadthing @uploadthing/react sonner next-themes lucide-react class-variance-authority clsx tailwind-merge
npm install -D drizzle-kit @types/node tsx vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom @playwright/test eslint eslint-config-next prettier prettier-plugin-tailwindcss
```

- [ ] **Step 3: Configure TypeScript strict mode**

Overwrite `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Initialize shadcn/ui**

```bash
npx shadcn@latest init -d
```

When prompted, accept defaults: base color **Slate**, CSS variables **Yes**.

Then install the components we'll need in Phase 1:

```bash
npx shadcn@latest add button card form input label dialog dropdown-menu avatar table tabs separator sonner skeleton alert badge sheet tooltip
```

- [ ] **Step 5: Set dark mode default and add ThemeProvider**

Create `src/components/layout/ThemeProvider.tsx`:

```tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Darts Tournament",
  description: "Local darts tournament with virtual betting",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

Replace `src/app/page.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold">Darts Tournament</h1>
      <p className="text-muted-foreground">Lokální turnaj s virtuálními sázkami.</p>
      <div className="flex gap-4">
        <Button asChild>
          <Link href="/login">Přihlásit se</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/register">Registrovat se</Link>
        </Button>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Create .env.example**

```bash
# Database
DATABASE_URL="postgres://darts:darts@localhost:5432/darts"

# NextAuth
AUTH_SECRET=""               # generate: openssl rand -base64 32
AUTH_URL="http://localhost:3000"

# UploadThing
UPLOADTHING_TOKEN=""         # from https://uploadthing.com dashboard
```

Append to `.gitignore`:

```
.env
.env.local
*.local
/test-results/
/playwright-report/
/coverage/
```

- [ ] **Step 7: Verify build + dev start**

```bash
npm run build
```

Expected: build succeeds, no type errors.

```bash
npm run dev
```

Expected: dev server starts on port 3000. Stop with Ctrl-C.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat(phase1): scaffold Next.js 15 + shadcn/ui + Tailwind v4"
```

---

## Task 2: Local Postgres + Drizzle Setup

**Files:**
- Create: `docker-compose.yml`, `drizzle.config.ts`, `src/db/client.ts`, `src/db/schema.ts`, `tests/setup/db.ts`

- [ ] **Step 1: Add docker-compose for local Postgres**

Create `docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: darts-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: darts
      POSTGRES_PASSWORD: darts
      POSTGRES_DB: darts
    ports:
      - "5432:5432"
    volumes:
      - darts_pgdata:/var/lib/postgresql/data

  db_test:
    image: postgres:16-alpine
    container_name: darts-postgres-test
    restart: unless-stopped
    environment:
      POSTGRES_USER: darts
      POSTGRES_PASSWORD: darts
      POSTGRES_DB: darts_test
    ports:
      - "5433:5432"
    tmpfs:
      - /var/lib/postgresql/data

volumes:
  darts_pgdata:
```

Start both:

```bash
docker compose up -d
docker compose ps
```

Expected: both containers `running`.

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Generate `AUTH_SECRET`:

```bash
openssl rand -base64 32
```

Paste output into `.env` `AUTH_SECRET=""`.

- [ ] **Step 2: Configure Drizzle**

Create `drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL must be set");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
```

- [ ] **Step 3: Define users + transactions schema**

Create `src/db/schema.ts`:

```ts
import { pgTable, pgEnum, uuid, text, varchar, timestamp, numeric, index } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

export const transactionTypeEnum = pgEnum("transaction_type", [
  "initial",
  "bet_placed",
  "bet_won",
  "bet_refund",
  "admin_adjust",
  "tournament_reset",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    username: varchar("username", { length: 20 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
    role: userRoleEnum("role").notNull().default("user"),
    capital: numeric("capital", { precision: 12, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    usernameIdx: index("users_username_idx").on(t.username),
  })
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    type: transactionTypeEnum("type").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 12, scale: 2 }).notNull(),
    betId: uuid("bet_id"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("transactions_user_idx").on(t.userId),
    createdAtIdx: index("transactions_created_at_idx").on(t.createdAt),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
```

- [ ] **Step 4: Create DB client (server-only)**

Create `src/db/client.ts`:

```ts
import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL must be set");

const queryClient = postgres(connectionString, { max: 10 });

export const db = drizzle(queryClient, { schema });
export type DB = typeof db;
```

- [ ] **Step 5: Add npm scripts**

Add to `package.json` `"scripts"`:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:push": "drizzle-kit push",
"db:studio": "drizzle-kit studio",
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test"
```

- [ ] **Step 6: Generate and apply migration**

```bash
npm run db:generate
```

Expected: SQL file created in `src/db/migrations/0000_*.sql`.

```bash
npm run db:migrate
```

Expected: migration applied to local Postgres.

Verify with a quick check:

```bash
docker exec -it darts-postgres psql -U darts -d darts -c "\dt"
```

Expected: tables `users`, `transactions`, `__drizzle_migrations` shown.

- [ ] **Step 7: Create test DB setup helper**

Create `tests/setup/db.ts`:

```ts
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
  await testDb.execute(sql`TRUNCATE TABLE transactions, users RESTART IDENTITY CASCADE`);
}

export async function teardownTestDb() {
  await client.end();
}
```

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat(phase1): postgres + drizzle setup with users/transactions schema"
```

---

## Task 3: Password Hashing (TDD)

**Files:**
- Test: `tests/unit/password.test.ts`
- Create: `src/lib/password.ts`
- Create: `vitest.config.ts`

- [ ] **Step 1: Configure Vitest with env setup**

Create `tests/setup/env.ts` (runs before any test file imports — overrides DATABASE_URL so the prod DB singleton connects to the test DB):

```ts
process.env.DATABASE_URL = "postgres://darts:darts@localhost:5433/darts_test";
process.env.AUTH_SECRET ??= "test-secret";
process.env.AUTH_URL ??= "http://localhost:3000";
process.env.UPLOADTHING_TOKEN ??= "test-token";
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: false,
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup/env.ts"],
    testTimeout: 15000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

`singleFork: true` serializes integration tests so they don't fight over the shared test DB.

- [ ] **Step 2: Write failing tests for password module**

Create `tests/unit/password.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("password module", () => {
  it("hashes a password to a non-empty string different from input", async () => {
    const hash = await hashPassword("secret123");
    expect(hash).toBeTypeOf("string");
    expect(hash.length).toBeGreaterThan(20);
    expect(hash).not.toBe("secret123");
  });

  it("produces different hashes for same input (salted)", async () => {
    const a = await hashPassword("secret123");
    const b = await hashPassword("secret123");
    expect(a).not.toBe(b);
  });

  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("rejects empty password", async () => {
    await expect(hashPassword("")).rejects.toThrow(/empty/i);
  });
});
```

- [ ] **Step 3: Run test to verify failure**

```bash
npm test -- tests/unit/password.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement password module**

Create `src/lib/password.ts`:

```ts
import argon2 from "argon2";

const OPTS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length === 0) {
    throw new Error("password must not be empty");
  }
  return argon2.hash(plain, OPTS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Run tests to verify pass**

```bash
npm test -- tests/unit/password.test.ts
```

Expected: 5 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/password.ts tests/unit/password.test.ts vitest.config.ts
git commit -m "feat(phase1): argon2id password hashing with TDD"
```

---

## Task 4: Zod Validation Schemas (TDD)

**Files:**
- Test: `tests/unit/validation.test.ts`
- Create: `src/lib/validation.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { RegisterSchema, LoginSchema, ProfileUpdateSchema, CapitalAdjustSchema } from "@/lib/validation";

describe("RegisterSchema", () => {
  it("accepts valid input", () => {
    const r = RegisterSchema.safeParse({
      email: "test@example.com",
      username: "karel_99",
      password: "hunter2hunter",
    });
    expect(r.success).toBe(true);
  });

  it("rejects bad email", () => {
    const r = RegisterSchema.safeParse({ email: "no-at", username: "karel", password: "longenough" });
    expect(r.success).toBe(false);
  });

  it("rejects short username", () => {
    const r = RegisterSchema.safeParse({ email: "a@b.cz", username: "ab", password: "longenough" });
    expect(r.success).toBe(false);
  });

  it("rejects username with spaces", () => {
    const r = RegisterSchema.safeParse({ email: "a@b.cz", username: "with space", password: "longenough" });
    expect(r.success).toBe(false);
  });

  it("rejects short password", () => {
    const r = RegisterSchema.safeParse({ email: "a@b.cz", username: "karel", password: "short" });
    expect(r.success).toBe(false);
  });
});

describe("LoginSchema", () => {
  it("accepts valid", () => {
    expect(LoginSchema.safeParse({ email: "a@b.cz", password: "anything" }).success).toBe(true);
  });
  it("rejects missing fields", () => {
    expect(LoginSchema.safeParse({ email: "a@b.cz" }).success).toBe(false);
  });
});

describe("ProfileUpdateSchema", () => {
  it("accepts bio update", () => {
    expect(ProfileUpdateSchema.safeParse({ bio: "Hello" }).success).toBe(true);
  });
  it("accepts password change with current + new", () => {
    const r = ProfileUpdateSchema.safeParse({ currentPassword: "old1234567", newPassword: "new1234567" });
    expect(r.success).toBe(true);
  });
  it("rejects new password without current", () => {
    const r = ProfileUpdateSchema.safeParse({ newPassword: "new1234567" });
    expect(r.success).toBe(false);
  });
  it("rejects bio over 500 chars", () => {
    expect(ProfileUpdateSchema.safeParse({ bio: "x".repeat(501) }).success).toBe(false);
  });
});

describe("CapitalAdjustSchema", () => {
  it("accepts positive amount with note", () => {
    expect(CapitalAdjustSchema.safeParse({ amount: 100, note: "bonus" }).success).toBe(true);
  });
  it("accepts negative amount with note", () => {
    expect(CapitalAdjustSchema.safeParse({ amount: -50, note: "fine" }).success).toBe(true);
  });
  it("rejects zero", () => {
    expect(CapitalAdjustSchema.safeParse({ amount: 0, note: "x" }).success).toBe(false);
  });
  it("rejects missing note", () => {
    expect(CapitalAdjustSchema.safeParse({ amount: 100 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/unit/validation.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement schemas**

Create `src/lib/validation.ts`:

```ts
import { z } from "zod";

const usernameRegex = /^[a-zA-Z0-9_]+$/;

export const RegisterSchema = z.object({
  email: z.string().email().max(255),
  username: z.string().min(3).max(20).regex(usernameRegex, "Username may only contain letters, numbers, and underscores"),
  password: z.string().min(8).max(200),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const ProfileUpdateSchema = z
  .object({
    bio: z.string().max(500).optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword: z.string().min(8).max(200).optional(),
  })
  .refine(
    (v) => {
      if (v.newPassword && !v.currentPassword) return false;
      if (v.currentPassword && !v.newPassword) return false;
      return true;
    },
    { message: "Both currentPassword and newPassword required to change password" }
  );
export type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>;

export const CapitalAdjustSchema = z.object({
  amount: z.number().refine((n) => n !== 0, { message: "amount must not be zero" }),
  note: z.string().min(1).max(500),
});
export type CapitalAdjustInput = z.infer<typeof CapitalAdjustSchema>;
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/validation.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.ts tests/unit/validation.test.ts
git commit -m "feat(phase1): zod schemas for auth + profile + capital"
```

---

## Task 5: CapitalService (TDD)

**Files:**
- Test: `tests/unit/capital.test.ts` (integration-style — uses test DB)
- Create: `src/lib/capital.ts`
- Create: `tests/setup/factories.ts`

- [ ] **Step 1: Create test factories**

Create `tests/setup/factories.ts`:

```ts
import { testDb } from "./db";
import { users, type NewUser } from "@/db/schema";

let counter = 0;

export async function createUser(overrides: Partial<NewUser> = {}) {
  counter++;
  const [u] = await testDb
    .insert(users)
    .values({
      email: overrides.email ?? `user${counter}@test.cz`,
      username: overrides.username ?? `user${counter}`,
      passwordHash: overrides.passwordHash ?? "fake-hash",
      role: overrides.role ?? "user",
      capital: overrides.capital ?? "0",
      ...overrides,
    })
    .returning();
  if (!u) throw new Error("failed to create user");
  return u;
}
```

- [ ] **Step 2: Write failing tests for CapitalService**

Create `tests/unit/capital.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { setupTestDb, truncateAll, teardownTestDb, testDb } from "../setup/db";
import { createUser } from "../setup/factories";
import { transactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { CapitalService } from "@/lib/capital";

const service = new CapitalService(testDb);

beforeAll(async () => {
  await setupTestDb();
});
beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await teardownTestDb();
});

describe("CapitalService", () => {
  it("initialDeposit sets balance and logs transaction", async () => {
    const u = await createUser({ capital: "0" });
    const newBalance = await service.initialDeposit(u.id, 1000);
    expect(newBalance).toBe("1000.00");
    const txs = await testDb.select().from(transactions).where(eq(transactions.userId, u.id));
    expect(txs).toHaveLength(1);
    expect(txs[0]?.type).toBe("initial");
    expect(txs[0]?.amount).toBe("1000.00");
    expect(txs[0]?.balanceAfter).toBe("1000.00");
  });

  it("debit reduces balance and logs transaction", async () => {
    const u = await createUser({ capital: "500" });
    const newBalance = await service.debit(u.id, 200, "bet_placed", { betId: null, note: "test bet" });
    expect(newBalance).toBe("300.00");
    const tx = (await testDb.select().from(transactions).where(eq(transactions.userId, u.id)))[0];
    expect(tx?.amount).toBe("-200.00");
    expect(tx?.balanceAfter).toBe("300.00");
    expect(tx?.type).toBe("bet_placed");
  });

  it("debit rejects when insufficient balance", async () => {
    const u = await createUser({ capital: "100" });
    await expect(service.debit(u.id, 200, "bet_placed")).rejects.toThrow(/insufficient/i);
    const txs = await testDb.select().from(transactions).where(eq(transactions.userId, u.id));
    expect(txs).toHaveLength(0);
  });

  it("credit increases balance and logs transaction", async () => {
    const u = await createUser({ capital: "100" });
    const newBalance = await service.credit(u.id, 50, "bet_won", { betId: null });
    expect(newBalance).toBe("150.00");
    const tx = (await testDb.select().from(transactions).where(eq(transactions.userId, u.id)))[0];
    expect(tx?.amount).toBe("50.00");
    expect(tx?.balanceAfter).toBe("150.00");
  });

  it("adminAdjust positive credits with admin id and note", async () => {
    const admin = await createUser({ role: "admin", username: "admin1", email: "a@a.cz" });
    const u = await createUser({ capital: "100", username: "u1", email: "u1@a.cz" });
    await service.adminAdjust(u.id, 25, "bonus", admin.id);
    const tx = (await testDb.select().from(transactions).where(eq(transactions.userId, u.id)))[0];
    expect(tx?.amount).toBe("25.00");
    expect(tx?.note).toBe("bonus");
    expect(tx?.createdBy).toBe(admin.id);
  });

  it("adminAdjust negative debits with admin id and note", async () => {
    const admin = await createUser({ role: "admin", username: "admin2", email: "a2@a.cz" });
    const u = await createUser({ capital: "100", username: "u2", email: "u2@a.cz" });
    await service.adminAdjust(u.id, -30, "correction", admin.id);
    const tx = (await testDb.select().from(transactions).where(eq(transactions.userId, u.id)))[0];
    expect(tx?.amount).toBe("-30.00");
    expect(tx?.balanceAfter).toBe("70.00");
  });

  it("adminAdjust rejects if it would push balance negative", async () => {
    const admin = await createUser({ role: "admin", username: "admin3", email: "a3@a.cz" });
    const u = await createUser({ capital: "10", username: "u3", email: "u3@a.cz" });
    await expect(service.adminAdjust(u.id, -50, "correction", admin.id)).rejects.toThrow(/negative/i);
  });

  it("getTransactions returns user transactions in reverse chronological order", async () => {
    const u = await createUser({ capital: "0" });
    await service.initialDeposit(u.id, 1000);
    await service.debit(u.id, 100, "bet_placed");
    await service.credit(u.id, 50, "bet_won");
    const list = await service.getTransactions(u.id, 10);
    expect(list).toHaveLength(3);
    expect(list[0]?.type).toBe("bet_won");
    expect(list[2]?.type).toBe("initial");
  });
});
```

- [ ] **Step 3: Run to confirm failure**

```bash
npm test -- tests/unit/capital.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement CapitalService**

Create `src/lib/capital.ts`:

```ts
import { eq, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { users, transactions, type Transaction } from "@/db/schema";
import type { DB } from "@/db/client";

type DebitType = "bet_placed";
type CreditType = "bet_won" | "bet_refund";
type AdjustOpts = { betId?: string | null; note?: string };

export class CapitalService {
  constructor(private readonly db: DB) {}

  async initialDeposit(userId: string, amount: number): Promise<string> {
    if (amount <= 0) throw new Error("initial deposit must be positive");
    return this.db.transaction(async (tx) => {
      const [u] = await tx.select({ capital: users.capital }).from(users).where(eq(users.id, userId)).for("update");
      if (!u) throw new Error("user not found");
      const newBalance = (Number(u.capital) + amount).toFixed(2);
      await tx.update(users).set({ capital: newBalance }).where(eq(users.id, userId));
      await tx.insert(transactions).values({
        userId,
        type: "initial",
        amount: amount.toFixed(2),
        balanceAfter: newBalance,
      });
      return newBalance;
    });
  }

  async debit(userId: string, amount: number, type: DebitType, opts: AdjustOpts = {}): Promise<string> {
    if (amount <= 0) throw new Error("debit amount must be positive");
    return this.db.transaction(async (tx) => {
      const [u] = await tx.select({ capital: users.capital }).from(users).where(eq(users.id, userId)).for("update");
      if (!u) throw new Error("user not found");
      const current = Number(u.capital);
      if (current < amount) throw new Error("insufficient balance");
      const newBalance = (current - amount).toFixed(2);
      await tx.update(users).set({ capital: newBalance }).where(eq(users.id, userId));
      await tx.insert(transactions).values({
        userId,
        type,
        amount: (-amount).toFixed(2),
        balanceAfter: newBalance,
        betId: opts.betId ?? null,
        note: opts.note ?? null,
      });
      return newBalance;
    });
  }

  async credit(userId: string, amount: number, type: CreditType, opts: AdjustOpts = {}): Promise<string> {
    if (amount <= 0) throw new Error("credit amount must be positive");
    return this.db.transaction(async (tx) => {
      const [u] = await tx.select({ capital: users.capital }).from(users).where(eq(users.id, userId)).for("update");
      if (!u) throw new Error("user not found");
      const newBalance = (Number(u.capital) + amount).toFixed(2);
      await tx.update(users).set({ capital: newBalance }).where(eq(users.id, userId));
      await tx.insert(transactions).values({
        userId,
        type,
        amount: amount.toFixed(2),
        balanceAfter: newBalance,
        betId: opts.betId ?? null,
        note: opts.note ?? null,
      });
      return newBalance;
    });
  }

  async adminAdjust(userId: string, amount: number, note: string, adminId: string): Promise<string> {
    if (amount === 0) throw new Error("adjust amount must not be zero");
    if (!note || note.trim().length === 0) throw new Error("note required");
    return this.db.transaction(async (tx) => {
      const [u] = await tx.select({ capital: users.capital }).from(users).where(eq(users.id, userId)).for("update");
      if (!u) throw new Error("user not found");
      const current = Number(u.capital);
      const next = current + amount;
      if (next < 0) throw new Error("adjustment would make balance negative");
      const newBalance = next.toFixed(2);
      await tx.update(users).set({ capital: newBalance }).where(eq(users.id, userId));
      await tx.insert(transactions).values({
        userId,
        type: "admin_adjust",
        amount: amount.toFixed(2),
        balanceAfter: newBalance,
        note,
        createdBy: adminId,
      });
      return newBalance;
    });
  }

  async getTransactions(userId: string, limit = 50): Promise<Transaction[]> {
    return this.db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt))
      .limit(limit);
  }

  async getAllTransactions(limit = 100): Promise<Transaction[]> {
    return this.db.select().from(transactions).orderBy(desc(transactions.createdAt)).limit(limit);
  }
}

// Default singleton bound to the production DB client.
// Tests construct their own with the test DB.
import { db } from "@/db/client";
export const capitalService = new CapitalService(db);
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/unit/capital.test.ts
```

Expected: 8 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/capital.ts tests/unit/capital.test.ts tests/setup/db.ts tests/setup/factories.ts
git commit -m "feat(phase1): CapitalService with atomic debit/credit and audit log"
```

---

## Task 6: NextAuth.js v5 Setup

**Files:**
- Create: `src/lib/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/types/next-auth.d.ts`, `src/middleware.ts`

- [ ] **Step 1: Configure auth**

Create `src/lib/auth.ts`:

```ts
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/password";
import { LoginSchema } from "@/lib/validation";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = LoginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const [u] = await db.select().from(users).where(eq(users.email, email));
        if (!u) return null;
        const ok = await verifyPassword(password, u.passwordHash);
        if (!ok) return null;
        return { id: u.id, email: u.email, name: u.username, image: u.avatarUrl, role: u.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: "user" | "admin" }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "user" | "admin";
      }
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "user" | "admin";
    } & DefaultSession["user"];
  }
  interface User {
    role: "user" | "admin";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "user" | "admin";
  }
}
```

- [ ] **Step 2: Wire route handler**

Create `src/app/api/auth/[...nextauth]/route.ts`:

```ts
export { GET, POST } from "@/lib/auth";
```

Wait — that's not right. The handlers from `auth.ts` export `handlers` which is `{ GET, POST }`. Fix:

```ts
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 3: Add middleware for route protection**

Create `src/middleware.ts`:

```ts
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const PROTECTED = ["/dashboard", "/settings", "/bets", "/leaderboard"];
const ADMIN_ONLY = ["/admin"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  if (ADMIN_ONLY.some((p) => pathname.startsWith(p))) {
    if (!session?.user) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (session.user.role !== "admin") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  if (PROTECTED.some((p) => pathname.startsWith(p))) {
    if (!session?.user) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/app/api/auth src/middleware.ts
git commit -m "feat(phase1): NextAuth v5 with credentials + role-based middleware"
```

---

## Task 7: Registration

**Files:**
- Test: `tests/integration/auth.test.ts`
- Create: `src/app/(auth)/register/actions.ts`, `src/app/(auth)/register/page.tsx`, `src/app/(auth)/layout.tsx`, `src/components/auth/RegisterForm.tsx`

- [ ] **Step 1: Write failing integration test for register action**

Create `tests/integration/auth.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { setupTestDb, truncateAll, teardownTestDb, testDb } from "../setup/db";
import { eq } from "drizzle-orm";
import { users, transactions } from "@/db/schema";
import { registerUser } from "@/app/(auth)/register/actions";
import { verifyPassword } from "@/lib/password";

beforeAll(async () => {
  await setupTestDb();
});
beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await teardownTestDb();
});

describe("registerUser action", () => {
  it("creates user with hashed password and zero capital when no tournament exists", async () => {
    const result = await registerUser({
      email: "karel@test.cz",
      username: "karel99",
      password: "longenoughpw",
    });
    expect(result.ok).toBe(true);
    const [u] = await testDb.select().from(users).where(eq(users.email, "karel@test.cz"));
    expect(u).toBeDefined();
    expect(u?.username).toBe("karel99");
    expect(u?.role).toBe("admin"); // first user
    expect(await verifyPassword("longenoughpw", u!.passwordHash)).toBe(true);
  });

  it("second user gets role 'user'", async () => {
    await registerUser({ email: "a@a.cz", username: "userA", password: "longenough" });
    await registerUser({ email: "b@b.cz", username: "userB", password: "longenough" });
    const [u] = await testDb.select().from(users).where(eq(users.email, "b@b.cz"));
    expect(u?.role).toBe("user");
  });

  it("rejects duplicate email", async () => {
    await registerUser({ email: "dup@a.cz", username: "first", password: "longenough" });
    const r = await registerUser({ email: "dup@a.cz", username: "second", password: "longenough" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/email/i);
  });

  it("rejects duplicate username", async () => {
    await registerUser({ email: "a1@a.cz", username: "samename", password: "longenough" });
    const r = await registerUser({ email: "a2@a.cz", username: "samename", password: "longenough" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/username/i);
  });

  it("rejects invalid input", async () => {
    const r = await registerUser({ email: "bad", username: "x", password: "short" });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Confirm failure**

```bash
npm test -- tests/integration/auth.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement register action**

Create `src/app/(auth)/register/actions.ts`:

```ts
"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { RegisterSchema, type RegisterInput } from "@/lib/validation";

export type RegisterResult = { ok: true; userId: string } | { ok: false; error: string };

export async function registerUser(input: RegisterInput): Promise<RegisterResult> {
  const parsed = RegisterSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { email, username, password } = parsed.data;

  const [existingEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existingEmail) return { ok: false, error: "Email already registered" };

  const [existingUsername] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
  if (existingUsername) return { ok: false, error: "Username already taken" };

  const [countRow] = await db.select({ c: users.id }).from(users).limit(1);
  const isFirstUser = !countRow;

  const passwordHash = await hashPassword(password);
  const [created] = await db
    .insert(users)
    .values({
      email,
      username,
      passwordHash,
      role: isFirstUser ? "admin" : "user",
      capital: "0",
    })
    .returning({ id: users.id });

  if (!created) return { ok: false, error: "Failed to create user" };
  return { ok: true, userId: created.id };
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/integration/auth.test.ts
```

Expected: 5 PASS.

- [ ] **Step 5: Build register UI**

Create `src/app/(auth)/layout.tsx`:

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
```

Create `src/components/auth/RegisterForm.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { registerUser } from "@/app/(auth)/register/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RegisterForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    const input = {
      email: String(formData.get("email") ?? ""),
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? ""),
    };
    start(async () => {
      const result = await registerUser(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const signInResult = await signIn("credentials", {
        email: input.email,
        password: input.password,
        redirect: false,
      });
      if (signInResult?.error) {
        setError("Registered, but auto-login failed. Please log in.");
        router.push("/login");
        return;
      }
      toast.success("Účet vytvořen");
      router.push("/");
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input id="username" name="username" required autoComplete="username" minLength={3} maxLength={20} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Heslo</Label>
        <Input id="password" name="password" type="password" required autoComplete="new-password" minLength={8} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Vytváří se…" : "Registrovat"}
      </Button>
    </form>
  );
}
```

Create `src/app/(auth)/register/page.tsx`:

```tsx
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RegisterForm } from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrace</CardTitle>
        <CardDescription>Vytvoř si účet pro účast v turnajích.</CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm />
        <p className="mt-4 text-sm text-muted-foreground">
          Už máš účet?{" "}
          <Link href="/login" className="underline">
            Přihlásit se
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Verify build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add tests/integration/auth.test.ts src/app/(auth) src/components/auth
git commit -m "feat(phase1): registration with first-user-admin bootstrap"
```

---

## Task 8: Login

**Files:**
- Create: `src/app/(auth)/login/page.tsx`, `src/components/auth/LoginForm.tsx`

- [ ] **Step 1: Build LoginForm component**

Create `src/components/auth/LoginForm.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    start(async () => {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (!result || result.error) {
        setError("Neplatné přihlašovací údaje");
        return;
      }
      toast.success("Přihlášeno");
      router.push(params.get("from") ?? "/");
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Heslo</Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Přihlašuji…" : "Přihlásit"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Build login page**

Create `src/app/(auth)/login/page.tsx`:

```tsx
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Přihlášení</CardTitle>
        <CardDescription>Zadej email a heslo.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
        <p className="mt-4 text-sm text-muted-foreground">
          Nemáš účet?{" "}
          <Link href="/register" className="underline">
            Registrovat se
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Wrap app in SessionProvider**

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { auth } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Darts Tournament",
  description: "Local darts tournament with virtual betting",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <html lang="cs" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <SessionProvider session={session}>{children}</SessionProvider>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Manual smoke test**

```bash
npm run dev
```

Open http://localhost:3000, click "Registrovat se", create account, then test login flow. Verify cookie set and redirect to `/`.

Stop with Ctrl-C.

- [ ] **Step 6: Commit**

```bash
git add src/app/(auth)/login src/components/auth/LoginForm.tsx src/app/layout.tsx
git commit -m "feat(phase1): login flow with SessionProvider wired"
```

---

## Task 9: Authenticated App Layout + Sidebar

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/UserMenu.tsx`, `src/components/user/CapitalDisplay.tsx`

- [ ] **Step 1: Create CapitalDisplay**

Create `src/components/user/CapitalDisplay.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";

export function CapitalDisplay({ capital }: { capital: string }) {
  const formatted = new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(capital));
  return (
    <Badge variant="secondary" className="font-mono text-base">
      {formatted}
    </Badge>
  );
}
```

- [ ] **Step 2: Create UserMenu**

Create `src/components/layout/UserMenu.tsx`:

```tsx
"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({
  username,
  avatarUrl,
  role,
}: {
  username: string;
  avatarUrl: string | null;
  role: "user" | "admin";
}) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar>
          {avatarUrl && <AvatarImage src={avatarUrl} alt={username} />}
          <AvatarFallback>{username.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{username}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/u/${username}`}>Můj profil</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">Nastavení</Link>
        </DropdownMenuItem>
        {role === "admin" && (
          <DropdownMenuItem asChild>
            <Link href="/admin">Admin</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await signOut({ redirect: false });
            router.push("/");
            router.refresh();
          }}
        >
          Odhlásit
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 3: Create Sidebar**

Create `src/components/layout/Sidebar.tsx`:

```tsx
import Link from "next/link";
import { Home, Trophy, Receipt, Award } from "lucide-react";

export function Sidebar() {
  return (
    <aside className="w-56 border-r p-4 space-y-2">
      <Link href="/" className="block text-xl font-bold mb-6">
        🎯 Darts
      </Link>
      <nav className="space-y-1">
        <SidebarLink href="/" icon={<Home className="h-4 w-4" />} label="Dashboard" />
        <SidebarLink href="/tournament" icon={<Trophy className="h-4 w-4" />} label="Turnaj" />
        <SidebarLink href="/bets" icon={<Receipt className="h-4 w-4" />} label="Moje sázky" />
        <SidebarLink href="/leaderboard" icon={<Award className="h-4 w-4" />} label="Žebříček" />
      </nav>
    </aside>
  );
}

function SidebarLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
    >
      {icon}
      {label}
    </Link>
  );
}
```

- [ ] **Step 4: Create authenticated app layout**

Create `src/app/(app)/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { Sidebar } from "@/components/layout/Sidebar";
import { UserMenu } from "@/components/layout/UserMenu";
import { CapitalDisplay } from "@/components/user/CapitalDisplay";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const [me] = await db
    .select({ username: users.username, avatarUrl: users.avatarUrl, capital: users.capital, role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id));
  if (!me) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-4 border-b p-4">
          <CapitalDisplay capital={me.capital} />
          <UserMenu username={me.username} avatarUrl={me.avatarUrl} role={me.role} />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create dashboard placeholder**

Create `src/app/(app)/page.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <Card>
        <CardHeader>
          <CardTitle>Vítej</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Aktivní turnaj zatím není. Až ho admin založí, objeví se zde přehled zápasů a sázek.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Replace public landing**

The (app) group now owns `/`. The public landing in `src/app/page.tsx` would conflict. Move it: delete `src/app/page.tsx`, and rely on the middleware to redirect unauthenticated users from `/` to `/login` (the middleware doesn't currently protect `/`, fix that).

Update `src/middleware.ts` — change `PROTECTED` to include `/`:

```ts
const PROTECTED = ["/", "/dashboard", "/settings", "/bets", "/leaderboard"];
```

But the middleware matcher excludes `api`, `_next`, `favicon` — `/login` and `/register` aren't excluded, which means an unauthenticated user landing on `/login` would loop. Fix matcher to exclude `/login`, `/register`:

```ts
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login|register).*)"],
};
```

Delete the public landing:

```bash
rm src/app/page.tsx
```

- [ ] **Step 7: Verify build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 8: Manual smoke test**

```bash
npm run dev
```

Visit http://localhost:3000 — should redirect to /login. Log in — should land on the dashboard with sidebar, capital display, and user menu.

- [ ] **Step 9: Commit**

```bash
git add src/app src/components/layout src/components/user src/middleware.ts
git commit -m "feat(phase1): authenticated app shell with sidebar + user menu"
```

---

## Task 10: UploadThing for Avatars

**Files:**
- Create: `src/app/api/uploadthing/core.ts`, `src/app/api/uploadthing/route.ts`, `src/lib/uploadthing.ts`, `src/components/user/AvatarUpload.tsx`

- [ ] **Step 1: Add UploadThing file router**

Create `src/app/api/uploadthing/core.ts`:

```ts
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { auth } from "@/lib/auth";

const f = createUploadthing();

export const ourFileRouter = {
  avatar: f({ image: { maxFileSize: "2MB", maxFileCount: 1 } })
    .middleware(async () => {
      const session = await auth();
      if (!session?.user) throw new UploadThingError("Unauthorized");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { uploadedBy: metadata.userId, url: file.ufsUrl };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
```

Create `src/app/api/uploadthing/route.ts`:

```ts
import { createRouteHandler } from "uploadthing/next";
import { ourFileRouter } from "./core";

export const { GET, POST } = createRouteHandler({ router: ourFileRouter });
```

- [ ] **Step 2: Generate UploadThing client helpers**

Create `src/lib/uploadthing.ts`:

```ts
import {
  generateReactHelpers,
  generateUploadButton,
  generateUploadDropzone,
} from "@uploadthing/react";
import type { OurFileRouter } from "@/app/api/uploadthing/core";

export const { useUploadThing, uploadFiles } = generateReactHelpers<OurFileRouter>();
export const UploadButton = generateUploadButton<OurFileRouter>();
export const UploadDropzone = generateUploadDropzone<OurFileRouter>();
```

- [ ] **Step 3: Add AvatarUpload component**

Create `src/components/user/AvatarUpload.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UploadButton } from "@/lib/uploadthing";
import { updateAvatar } from "@/app/(app)/settings/actions";

export function AvatarUpload({
  username,
  currentUrl,
}: {
  username: string;
  currentUrl: string | null;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(currentUrl);
  return (
    <div className="flex items-center gap-4">
      <Avatar className="h-20 w-20">
        {url && <AvatarImage src={url} alt={username} />}
        <AvatarFallback>{username.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <UploadButton
        endpoint="avatar"
        onClientUploadComplete={async (res) => {
          const uploaded = res[0];
          if (!uploaded) return;
          const result = await updateAvatar(uploaded.url);
          if (result.ok) {
            setUrl(uploaded.url);
            toast.success("Profilovka aktualizována");
            router.refresh();
          } else {
            toast.error(result.error);
          }
        }}
        onUploadError={(err) => toast.error(err.message)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/uploadthing src/lib/uploadthing.ts src/components/user/AvatarUpload.tsx
git commit -m "feat(phase1): uploadthing wiring for avatar uploads"
```

---

## Task 11: Settings Page (profile + password change)

**Files:**
- Create: `src/app/(app)/settings/actions.ts`, `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Write integration test for settings actions**

Append to `tests/integration/auth.test.ts`:

```ts
import { updateBio, updateAvatar, changePassword } from "@/app/(app)/settings/actions";
import { hashPassword } from "@/lib/password";

describe("settings actions", () => {
  it("updateBio updates user bio", async () => {
    const u = await createUserViaService("bio@a.cz", "biouser");
    const result = await updateBio(u.id, "Hello world");
    expect(result.ok).toBe(true);
    const [updated] = await testDb.select().from(users).where(eq(users.id, u.id));
    expect(updated?.bio).toBe("Hello world");
  });

  it("updateAvatar updates avatar_url", async () => {
    const u = await createUserViaService("av@a.cz", "avuser");
    const result = await updateAvatar("https://cdn.example.com/x.png", u.id);
    expect(result.ok).toBe(true);
    const [updated] = await testDb.select().from(users).where(eq(users.id, u.id));
    expect(updated?.avatarUrl).toBe("https://cdn.example.com/x.png");
  });

  it("changePassword succeeds with correct current password", async () => {
    const passwordHash = await hashPassword("oldpassword123");
    const [u] = await testDb
      .insert(users)
      .values({ email: "pw@a.cz", username: "pwuser", passwordHash })
      .returning();
    const result = await changePassword(u!.id, "oldpassword123", "newpassword123");
    expect(result.ok).toBe(true);
    const [updated] = await testDb.select().from(users).where(eq(users.id, u!.id));
    expect(await verifyPassword("newpassword123", updated!.passwordHash)).toBe(true);
  });

  it("changePassword fails with wrong current password", async () => {
    const passwordHash = await hashPassword("oldpassword123");
    const [u] = await testDb
      .insert(users)
      .values({ email: "pw2@a.cz", username: "pwuser2", passwordHash })
      .returning();
    const result = await changePassword(u!.id, "WRONG", "newpassword123");
    expect(result.ok).toBe(false);
  });
});

async function createUserViaService(email: string, username: string) {
  const [u] = await testDb
    .insert(users)
    .values({ email, username, passwordHash: "x" })
    .returning();
  if (!u) throw new Error("failed to create");
  return u;
}
```

Note: `updateBio` and `changePassword` actions need to accept an explicit `userId` arg for testability (the production version reads from session, but exposes the implementation as `_internal` for tests). Implement that pattern in step 2.

- [ ] **Step 2: Confirm failure**

```bash
npm test -- tests/integration/auth.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement settings actions**

Create `src/app/(app)/settings/actions.ts`:

```ts
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { ProfileUpdateSchema } from "@/lib/validation";

type Result = { ok: true } | { ok: false; error: string };

async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function updateBio(userIdOrBioWhenSession: string, bioMaybe?: string): Promise<Result> {
  let userId: string | null;
  let bio: string;
  if (bioMaybe === undefined) {
    userId = await getCurrentUserId();
    bio = userIdOrBioWhenSession;
  } else {
    userId = userIdOrBioWhenSession;
    bio = bioMaybe;
  }
  if (!userId) return { ok: false, error: "Not authenticated" };
  const parsed = ProfileUpdateSchema.safeParse({ bio });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await db.update(users).set({ bio }).where(eq(users.id, userId));
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateAvatar(url: string, explicitUserId?: string): Promise<Result> {
  const userId = explicitUserId ?? (await getCurrentUserId());
  if (!userId) return { ok: false, error: "Not authenticated" };
  if (!/^https?:\/\//.test(url)) return { ok: false, error: "Invalid URL" };
  await db.update(users).set({ avatarUrl: url }).where(eq(users.id, userId));
  revalidatePath("/settings");
  return { ok: true };
}

export async function changePassword(
  userIdOrCurrentWhenSession: string,
  currentMaybeOrNew: string,
  newMaybe?: string
): Promise<Result> {
  let userId: string | null;
  let currentPassword: string;
  let newPassword: string;
  if (newMaybe === undefined) {
    userId = await getCurrentUserId();
    currentPassword = userIdOrCurrentWhenSession;
    newPassword = currentMaybeOrNew;
  } else {
    userId = userIdOrCurrentWhenSession;
    currentPassword = currentMaybeOrNew;
    newPassword = newMaybe;
  }
  if (!userId) return { ok: false, error: "Not authenticated" };
  const parsed = ProfileUpdateSchema.safeParse({ currentPassword, newPassword });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const [u] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId));
  if (!u) return { ok: false, error: "User not found" };
  const ok = await verifyPassword(currentPassword, u.passwordHash);
  if (!ok) return { ok: false, error: "Current password is incorrect" };
  const newHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, userId));
  return { ok: true };
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/integration/auth.test.ts
```

Expected: all PASS (including new settings tests).

- [ ] **Step 5: Build settings page**

Create `src/app/(app)/settings/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AvatarUpload } from "@/components/user/AvatarUpload";
import { BioForm, PasswordForm } from "./forms";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const [me] = await db
    .select({ username: users.username, avatarUrl: users.avatarUrl, bio: users.bio })
    .from(users)
    .where(eq(users.id, session.user.id));
  if (!me) redirect("/login");

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Nastavení</h1>
      <Card>
        <CardHeader>
          <CardTitle>Profilovka</CardTitle>
        </CardHeader>
        <CardContent>
          <AvatarUpload username={me.username} currentUrl={me.avatarUrl} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Bio</CardTitle>
        </CardHeader>
        <CardContent>
          <BioForm initialBio={me.bio ?? ""} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Změna hesla</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
```

Create `src/app/(app)/settings/forms.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateBio, changePassword } from "./actions";

export function BioForm({ initialBio }: { initialBio: string }) {
  const [bio, setBio] = useState(initialBio);
  const [pending, start] = useTransition();
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    start(async () => {
      const result = await updateBio(bio);
      if (result.ok) toast.success("Bio aktualizováno");
      else toast.error(result.error);
    });
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Input value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} placeholder="Něco o sobě" />
      <Button type="submit" disabled={pending}>
        {pending ? "Ukládám…" : "Uložit"}
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pending, start] = useTransition();
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    start(async () => {
      const result = await changePassword(current, next);
      if (result.ok) {
        toast.success("Heslo změněno");
        setCurrent("");
        setNext("");
      } else {
        toast.error(result.error);
      }
    });
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="current">Současné heslo</Label>
        <Input id="current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new">Nové heslo</Label>
        <Input id="new" type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Měním…" : "Změnit heslo"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 6: Verify build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/app/(app)/settings tests/integration/auth.test.ts
git commit -m "feat(phase1): settings page with bio, avatar, password change"
```

---

## Task 12: Public Profile Page

**Files:**
- Create: `src/app/(app)/u/[username]/page.tsx`, `src/components/user/ProfileCard.tsx`

- [ ] **Step 1: Create ProfileCard component**

Create `src/components/user/ProfileCard.tsx`:

```tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type Props = {
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  capital: string;
  role: "user" | "admin";
};

export function ProfileCard({ username, avatarUrl, bio, capital, role }: Props) {
  const formattedCapital = new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(capital));
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-4 space-y-0">
        <Avatar className="h-16 w-16">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={username} />}
          <AvatarFallback>{username.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <h2 className="text-xl font-semibold">{username}</h2>
          {role === "admin" && <Badge variant="outline">admin</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {bio && <p className="text-sm text-muted-foreground">{bio}</p>}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Kapitál:</span>
          <span className="font-mono">{formattedCapital}</span>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create public profile page**

Create `src/app/(app)/u/[username]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { ProfileCard } from "@/components/user/ProfileCard";

export default async function UserProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const [user] = await db
    .select({
      username: users.username,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      capital: users.capital,
      role: users.role,
    })
    .from(users)
    .where(eq(users.username, username));

  if (!user) notFound();

  return (
    <div className="max-w-2xl">
      <ProfileCard {...user} />
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/u src/components/user/ProfileCard.tsx
git commit -m "feat(phase1): public profile page at /u/[username]"
```

---

## Task 13: Admin Layout + Users Page

**Files:**
- Create: `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`, `src/app/admin/users/page.tsx`, `src/app/admin/users/actions.ts`, `src/components/admin/UserList.tsx`, `src/components/admin/CapitalAdjustDialog.tsx`

- [ ] **Step 1: Admin layout with guard**

Create `src/app/admin/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/");

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r p-4 space-y-1">
        <h2 className="mb-4 text-lg font-bold">Admin</h2>
        <Link href="/admin" className="block rounded px-2 py-1.5 text-sm hover:bg-accent">
          Dashboard
        </Link>
        <Link href="/admin/users" className="block rounded px-2 py-1.5 text-sm hover:bg-accent">
          Uživatelé
        </Link>
        <Link href="/admin/audit" className="block rounded px-2 py-1.5 text-sm hover:bg-accent">
          Audit log
        </Link>
        <div className="my-3 border-t" />
        <Link href="/" className="block rounded px-2 py-1.5 text-sm hover:bg-accent">
          ← Zpět do aplikace
        </Link>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
```

Create `src/app/admin/page.tsx`:

```tsx
export default function AdminDashboard() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Admin dashboard</h1>
      <p className="mt-2 text-muted-foreground">Vyber sekci v levém menu.</p>
    </div>
  );
}
```

- [ ] **Step 2: Write integration tests for admin actions**

Create `tests/integration/admin.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { setupTestDb, truncateAll, teardownTestDb, testDb } from "../setup/db";
import { createUser } from "../setup/factories";
import { users, transactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  adjustUserCapital,
  changeUserRole,
} from "@/app/admin/users/actions";

beforeAll(async () => {
  await setupTestDb();
});
beforeEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await teardownTestDb();
});

describe("admin actions", () => {
  it("adjustUserCapital credits and writes transaction", async () => {
    const admin = await createUser({ role: "admin", email: "a@a.cz", username: "admin1" });
    const target = await createUser({ capital: "100", email: "t@t.cz", username: "target1" });
    const result = await adjustUserCapital(target.id, 50, "bonus", admin.id);
    expect(result.ok).toBe(true);
    const [updated] = await testDb.select().from(users).where(eq(users.id, target.id));
    expect(updated?.capital).toBe("150.00");
    const txs = await testDb.select().from(transactions).where(eq(transactions.userId, target.id));
    expect(txs).toHaveLength(1);
    expect(txs[0]?.createdBy).toBe(admin.id);
    expect(txs[0]?.note).toBe("bonus");
  });

  it("adjustUserCapital rejects negative net balance", async () => {
    const admin = await createUser({ role: "admin", email: "a2@a.cz", username: "admin2" });
    const target = await createUser({ capital: "10", email: "t2@t.cz", username: "target2" });
    const result = await adjustUserCapital(target.id, -50, "fine", admin.id);
    expect(result.ok).toBe(false);
  });

  it("changeUserRole promotes user to admin", async () => {
    const admin = await createUser({ role: "admin", email: "a3@a.cz", username: "admin3" });
    const target = await createUser({ role: "user", email: "t3@t.cz", username: "target3" });
    const result = await changeUserRole(target.id, "admin", admin.id);
    expect(result.ok).toBe(true);
    const [updated] = await testDb.select().from(users).where(eq(users.id, target.id));
    expect(updated?.role).toBe("admin");
  });

  it("changeUserRole prevents admin from demoting themselves", async () => {
    const admin = await createUser({ role: "admin", email: "a4@a.cz", username: "admin4" });
    const result = await changeUserRole(admin.id, "user", admin.id);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Confirm failure**

```bash
npm test -- tests/integration/admin.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement admin actions**

Create `src/app/admin/users/actions.ts`:

```ts
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { capitalService } from "@/lib/capital";
import { CapitalAdjustSchema } from "@/lib/validation";

type Result = { ok: true } | { ok: false; error: string };

async function requireAdminId(explicit?: string): Promise<string | null> {
  if (explicit) return explicit;
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") return null;
  return session.user.id;
}

export async function adjustUserCapital(
  targetUserId: string,
  amount: number,
  note: string,
  explicitAdminId?: string
): Promise<Result> {
  const adminId = await requireAdminId(explicitAdminId);
  if (!adminId) return { ok: false, error: "Forbidden" };
  const parsed = CapitalAdjustSchema.safeParse({ amount, note });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    await capitalService.adminAdjust(targetUserId, amount, note, adminId);
    revalidatePath("/admin/users");
    revalidatePath("/admin/audit");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

export async function changeUserRole(
  targetUserId: string,
  newRole: "user" | "admin",
  explicitAdminId?: string
): Promise<Result> {
  const adminId = await requireAdminId(explicitAdminId);
  if (!adminId) return { ok: false, error: "Forbidden" };
  if (targetUserId === adminId) return { ok: false, error: "Cannot change your own role" };
  await db.update(users).set({ role: newRole }).where(eq(users.id, targetUserId));
  revalidatePath("/admin/users");
  return { ok: true };
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/integration/admin.test.ts
```

Expected: 4 PASS.

- [ ] **Step 6: Build UserList component**

Create `src/components/admin/UserList.tsx`:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { changeUserRole } from "@/app/admin/users/actions";
import { CapitalAdjustDialog } from "./CapitalAdjustDialog";

export type AdminUser = {
  id: string;
  username: string;
  email: string;
  role: "user" | "admin";
  capital: string;
};

export function UserList({ users, currentUserId }: { users: AdminUser[]; currentUserId: string }) {
  const router = useRouter();
  const [adjustingUser, setAdjustingUser] = useState<AdminUser | null>(null);

  async function onToggleRole(user: AdminUser) {
    const newRole = user.role === "admin" ? "user" : "admin";
    const result = await changeUserRole(user.id, newRole);
    if (result.ok) {
      toast.success("Role změněna");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const fmt = new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Username</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Kapitál</TableHead>
            <TableHead>Akce</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.username}</TableCell>
              <TableCell className="text-muted-foreground">{u.email}</TableCell>
              <TableCell>
                <Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge>
              </TableCell>
              <TableCell className="font-mono">{fmt.format(Number(u.capital))}</TableCell>
              <TableCell className="space-x-2">
                <Button size="sm" variant="outline" onClick={() => setAdjustingUser(u)}>
                  Upravit kapitál
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={u.id === currentUserId}
                  onClick={() => onToggleRole(u)}
                >
                  {u.role === "admin" ? "Demote" : "Promote"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {adjustingUser && (
        <CapitalAdjustDialog
          user={adjustingUser}
          onClose={() => setAdjustingUser(null)}
          onDone={() => {
            setAdjustingUser(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 7: Build CapitalAdjustDialog**

Create `src/components/admin/CapitalAdjustDialog.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adjustUserCapital } from "@/app/admin/users/actions";
import type { AdminUser } from "./UserList";

export function CapitalAdjustDialog({
  user,
  onClose,
  onDone,
}: {
  user: AdminUser;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("0");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const numeric = Number(amount);
    if (isNaN(numeric) || numeric === 0) {
      toast.error("Zadej nenulové číslo");
      return;
    }
    if (!note.trim()) {
      toast.error("Zadej poznámku");
      return;
    }
    start(async () => {
      const result = await adjustUserCapital(user.id, numeric, note.trim());
      if (result.ok) {
        toast.success(`Kapitál upraven o ${numeric}`);
        onDone();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upravit kapitál: {user.username}</DialogTitle>
          <DialogDescription>Současný kapitál: {user.capital}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Částka (kladné = credit, záporné = debit)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Poznámka (povinná)</Label>
            <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} required maxLength={500} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Zrušit
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Ukládám…" : "Uložit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 8: Build users page**

Create `src/app/admin/users/page.tsx`:

```tsx
import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { UserList } from "@/components/admin/UserList";

export default async function AdminUsersPage() {
  const session = await auth();
  const allUsers = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      capital: users.capital,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Uživatelé</h1>
      <UserList users={allUsers} currentUserId={session!.user.id} />
    </div>
  );
}
```

- [ ] **Step 9: Verify build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 10: Commit**

```bash
git add src/app/admin src/components/admin tests/integration/admin.test.ts
git commit -m "feat(phase1): admin users page with capital adjust + role toggle"
```

---

## Task 14: Admin Audit Log Page

**Files:**
- Create: `src/app/admin/audit/page.tsx`, `src/components/admin/AuditLogTable.tsx`

- [ ] **Step 1: Build AuditLogTable**

Create `src/components/admin/AuditLogTable.tsx`:

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export type AuditRow = {
  id: string;
  createdAt: Date;
  username: string;
  type: string;
  amount: string;
  balanceAfter: string;
  note: string | null;
  createdByUsername: string | null;
};

export function AuditLogTable({ rows }: { rows: AuditRow[] }) {
  const fmt = new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dt = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "short", timeStyle: "short" });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Čas</TableHead>
          <TableHead>Uživatel</TableHead>
          <TableHead>Typ</TableHead>
          <TableHead className="text-right">Částka</TableHead>
          <TableHead className="text-right">Zůstatek po</TableHead>
          <TableHead>Poznámka</TableHead>
          <TableHead>Provedl admin</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="whitespace-nowrap">{dt.format(r.createdAt)}</TableCell>
            <TableCell>{r.username}</TableCell>
            <TableCell>
              <Badge variant="outline">{r.type}</Badge>
            </TableCell>
            <TableCell className="text-right font-mono">{fmt.format(Number(r.amount))}</TableCell>
            <TableCell className="text-right font-mono">{fmt.format(Number(r.balanceAfter))}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{r.note ?? "—"}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{r.createdByUsername ?? "—"}</TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground">
              Žádné transakce
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 2: Build audit page with join query**

Create `src/app/admin/audit/page.tsx`:

```tsx
import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { transactions, users } from "@/db/schema";
import { AuditLogTable, type AuditRow } from "@/components/admin/AuditLogTable";

export default async function AuditLogPage() {
  const adminUsers = alias(users, "admin_users");
  const rows = await db
    .select({
      id: transactions.id,
      createdAt: transactions.createdAt,
      type: transactions.type,
      amount: transactions.amount,
      balanceAfter: transactions.balanceAfter,
      note: transactions.note,
      username: users.username,
      createdByUsername: adminUsers.username,
    })
    .from(transactions)
    .innerJoin(users, eq(users.id, transactions.userId))
    .leftJoin(adminUsers, eq(adminUsers.id, transactions.createdBy))
    .orderBy(desc(transactions.createdAt))
    .limit(200);

  const mapped: AuditRow[] = rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    username: r.username,
    type: r.type,
    amount: r.amount,
    balanceAfter: r.balanceAfter,
    note: r.note,
    createdByUsername: r.createdByUsername,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <p className="text-sm text-muted-foreground">Posledních 200 transakcí.</p>
      <AuditLogTable rows={mapped} />
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/audit src/components/admin/AuditLogTable.tsx
git commit -m "feat(phase1): admin audit log page with joined transaction view"
```

---

## Task 15: E2E Smoke Test (Playwright)

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/register-login.spec.ts`

- [ ] **Step 1: Configure Playwright**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

```bash
npx playwright install chromium
```

- [ ] **Step 2: Write smoke test**

Create `tests/e2e/register-login.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("user can register and reach dashboard", async ({ page }) => {
  const uniqueSuffix = Date.now();
  const email = `e2e-${uniqueSuffix}@test.cz`;
  const username = `e2euser${uniqueSuffix}`;

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Heslo").fill("longenoughpw");
  await page.getByRole("button", { name: /Registrovat/ }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByText(username)).toBeVisible({ timeout: 5000 });
});

test("user can log out and back in", async ({ page }) => {
  const uniqueSuffix = Date.now() + 1;
  const email = `e2e-${uniqueSuffix}@test.cz`;
  const username = `e2euser${uniqueSuffix}`;

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Heslo").fill("longenoughpw");
  await page.getByRole("button", { name: /Registrovat/ }).click();
  await expect(page).toHaveURL("/");

  await page.getByRole("button").filter({ has: page.locator("[class*=avatar]") }).first().click();
  await page.getByText("Odhlásit").click();
  await expect(page).toHaveURL("/login");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Heslo").fill("longenoughpw");
  await page.getByRole("button", { name: /Přihlásit/ }).click();
  await expect(page).toHaveURL("/");
});
```

- [ ] **Step 3: Run E2E locally**

Make sure dev DB is up:

```bash
docker compose up -d
```

Run:

```bash
npm run test:e2e
```

Expected: both tests PASS. (If the avatar selector in test 2 fails, inspect the DOM via Playwright UI and adjust selector — see Playwright codegen docs.)

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts tests/e2e
git commit -m "test(phase1): playwright e2e smoke for register + login flow"
```

---

## Task 16: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Add CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  lint-and-test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: darts
          POSTGRES_PASSWORD: darts
          POSTGRES_DB: darts_test
        ports:
          - 5433:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_URL: postgres://darts:darts@localhost:5433/darts_test
      AUTH_SECRET: ci-secret-do-not-use-in-prod
      AUTH_URL: http://localhost:3000
      UPLOADTHING_TOKEN: ci-fake-token

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: TypeScript check
        run: npx tsc --noEmit

      - name: Vitest (unit + integration)
        run: npm test

      - name: Build
        run: npm run build
```

- [ ] **Step 2: Verify locally that all checks pass**

```bash
docker compose up -d
npx tsc --noEmit
npm test
npm run build
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add .github
git commit -m "ci(phase1): github actions workflow for lint + test + build"
```

---

## Task 17: README + DEVELOPMENT Docs

**Files:**
- Modify: `README.md`
- Create: `DEVELOPMENT.md`

- [ ] **Step 1: Update README with project pitch**

Replace `README.md`:

```markdown
# Darts Tournament System

Web system for managing a local darts tournament with virtual-currency betting.

- Tournament management with configurable group + playoff format
- Virtual-capital betting with hybrid statistical + parimutuel odds
- Real-time score and odds updates
- User roles: user, admin

**Status:** Phase 1 (Foundation) — auth, profiles, capital tracking, admin user management.

See `docs/superpowers/specs/2026-05-24-darts-tournament-design.md` for the full design.

## Quick start

See [DEVELOPMENT.md](./DEVELOPMENT.md) for setup instructions.
```

- [ ] **Step 2: Create DEVELOPMENT.md**

Create `DEVELOPMENT.md`:

```markdown
# Development setup

## Prerequisites

- Node.js 20+
- Docker (for local Postgres)

## Setup

```bash
npm install
cp .env.example .env
# generate AUTH_SECRET and paste into .env
openssl rand -base64 32

docker compose up -d
npm run db:migrate
npm run dev
```

App runs at http://localhost:3000.

## First user

The first registered user automatically becomes admin.

## Tests

```bash
# unit + integration (uses docker-compose db_test on :5433)
npm test

# e2e
npm run test:e2e
```

## Useful commands

```bash
npm run db:studio        # browse DB
npm run db:generate      # new migration after schema change
npm run db:migrate       # apply migrations
docker compose logs db   # postgres logs
```
```

- [ ] **Step 3: Commit**

```bash
git add README.md DEVELOPMENT.md
git commit -m "docs(phase1): readme + development setup guide"
```

---

## Phase 1 Done

After all tasks complete:

- [ ] Run full verification:

```bash
docker compose up -d
npx tsc --noEmit && npm test && npm run build
```

Expected: all green.

- [ ] Manual smoke test:
  - Register first user → automatic admin
  - Log out, register second user → role `user`
  - First user visits `/admin/users` → can see both, can adjust capital
  - Check `/admin/audit` → adjustment is logged
  - User visits `/settings` → updates bio, uploads avatar, changes password
  - User visits `/u/[other-username]` → sees public profile

- [ ] Tag the milestone:

```bash
git tag -a phase-1-foundation -m "Phase 1: foundation complete"
```

Ready to proceed to **Phase 2: Tournament Engine**.
