# Development setup

## Prerequisites

- Node.js 20+
- PostgreSQL 16 (Docker or local install). Docker compose is preferred (`docker-compose.yml` provided), but local Homebrew Postgres on port 5432 also works.

## Setup

```bash
npm install
cp .env.example .env
# generate AUTH_SECRET and paste into .env:
openssl rand -base64 32
```

Start Postgres (pick one):

**Option A — Docker (recommended):**

```bash
docker compose up -d   # starts db on :5432 and db_test on :5433
```

Set `TEST_DATABASE_URL=postgres://darts:darts@localhost:5433/darts_test` in `.env` so tests use the ephemeral container.

**Option B — Local Postgres (no Docker):**

```bash
createdb -U darts darts
createdb -U darts darts_test
# Tests default to localhost:5432/darts_test if TEST_DATABASE_URL is unset.
```

Apply migrations and run the app:

```bash
npm run db:migrate
npm run dev
```

App runs at <http://localhost:3000>.

## First user

The first registered user automatically becomes admin.

## Real-time updates

Match detail, tournament overview, and the dashboard auto-refresh via
Server-Sent Events on `/api/events`. The pub/sub bus is in-process —
it works on a single Node server (local dev, single-instance prod).
For multi-instance deployments (Vercel serverless, multiple replicas)
swap `src/lib/event-bus.ts` for Pusher/Ably/Redis pub-sub; the
public API (`publish`/`subscribe`) is intentionally compatible.

## Tests

```bash
# Unit + integration (Vitest)
npm test

# E2E (Playwright) — first time install browsers:
npx playwright install chromium
npm run test:e2e
```

## Useful commands

```bash
npm run db:studio        # browse DB in browser
npm run db:generate      # generate a new migration after schema change
npm run db:migrate       # apply pending migrations
npm run lint             # eslint
npm run type-check       # tsc --noEmit
npm run format           # prettier --write .
```
