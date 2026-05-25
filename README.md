# Jabloňová Open — Darts Tournament System

End-to-end web app for running a local darts tournament: bracket
management, real-time scoreboard, virtual-currency parimutuel betting,
admin tools, and a public TV display.

Designed for an evening with 8–10 friends and a dartboard; everything
runs on a single laptop.

## Highlights

**For players (users)**
- Register, get auto-credited the tournament's starting capital
- Bet on match winner / correct score / individual leg winners
  directly from the tournament overview — odds are a hybrid of
  ELO baseline + parimutuel pool, blended by total wagered
- Dashboard with your capital, open bets, net profit, win rate
- `/bets` groups every bet by match, with green WON / red LOST badges
  and per-match net result
- `/leaderboard` ranks everyone by net profit, with bar chart that
  switches between Net Profit / ROI / Win Rate / Stake / Bet Count /
  Wins / Capital

**For the admin**
- Sidebar Admin section: Přehled / Turnaje / Uživatelé / Audit log /
  Nastavení
- New-tournament wizard (group count, group size, advance per group,
  best-of per phase, third-place match, starting capital)
- Drag-free player management with auto-random group assignment
- Match recording leg by leg — every leg updates score and emits a
  live event so all clients refresh
- Auto-grant starting capital to every user when groups start
- System settings page: change tournament/system name, upload a logo
  via UploadThing; logo appears in sidebar, login, TV display, favicon

**TV display (`/display`, no login)**
- Big tournament name + logo + elapsed time since start
- Live matches in 60pt score, with odds and total wagered pool
- "Na řadě" list of upcoming matches with their odds
- Playoff bracket with connecting lines, lit up in red when a match
  is live
- Rotating darts trivia footer

## Tech stack

- **Next.js 16** (App Router, RSC) + **React 19**
- **PostgreSQL 16** via **Drizzle ORM**
- **NextAuth v5** (credentials, Argon2id via `@node-rs/argon2`)
- **shadcn/ui** v4 + Tailwind v4, **Geist** font
- **UploadThing** for avatars + system logo
- **Recharts** for leaderboard comparison
- **Server-Sent Events** + in-process pub/sub for real-time
  (swap to Pusher for multi-instance deploys)

Sazba odds: ELO win-probability per leg → correct-score binomial
distribution → blended with parimutuel pool weighted by
`pool / parimutuel_threshold`.

## Local development

```bash
# 1. Install
nvm use                # Node 20
npm install

# 2. Postgres (Docker preferred, Homebrew works too)
docker compose up -d   # darts @ :5432, darts_test @ :5433
# Or with Homebrew:
#   brew install postgresql@16 && brew services start postgresql@16
#   createuser -s darts; createdb -O darts darts; createdb -O darts darts_test

# 3. Env
cp .env.example .env
echo "AUTH_SECRET=\"$(openssl rand -base64 32)\"" >> .env
# (optional) add UPLOADTHING_TOKEN from uploadthing.com if you want logo
# / avatar uploads

# 4. Migrations
npm run db:migrate

# 5. Dev mode (slow first compile per route, ~30–90 s)
npm run dev

# Or — production build, fast (recommended for actual tournaments)
npm run prod           # build + start, < 100 ms per request
```

App at <http://localhost:3000>. First registered user becomes admin.
TV display at <http://localhost:3000/display>.

## Project structure

```
src/
├── app/
│   ├── (app)/              ← user-facing pages (dashboard, /tournament, /bets, /leaderboard, /match/[id], /u/[username])
│   ├── (auth)/             ← login + register (public)
│   ├── admin/              ← admin section (gated)
│   ├── display/            ← TV display (public)
│   └── api/                ← NextAuth + UploadThing + SSE
├── components/
│   ├── ui/                 ← shadcn primitives
│   ├── tournament/         ← BracketView, MatchListCard, GroupTable, TvDisplay
│   ├── betting/            ← MarketCard, BetDialog, BetsByMatch, MyBetsTable
│   ├── admin/              ← TournamentControls, PlayerManager, MatchRow, SystemSettingsForm, …
│   └── leaderboard/        ← LeaderboardCharts (recharts)
├── lib/
│   ├── tournament.ts       ← TournamentService
│   ├── player.ts           ← PlayerService
│   ├── match.ts            ← MatchService (round-robin generator + standings)
│   ├── bracket.ts          ← BracketService (cross-seeding + advancement)
│   ├── leg.ts              ← LegService (start/record/cancel)
│   ├── match-lifecycle.ts  ← orchestrator (markets ↔ matches ↔ bets)
│   ├── market.ts           ← MarketService (create/close/settle/recompute odds)
│   ├── betting.ts          ← BettingService (atomic placement, settlement, refund)
│   ├── capital.ts          ← CapitalService (debit/credit + audit)
│   ├── odds.ts             ← pure odds math (correct-score, parimutuel, blend)
│   ├── elo.ts              ← ELO win prob + update
│   ├── settings.ts         ← app_settings singleton (name + logo)
│   ├── event-bus.ts        ← in-process pub/sub
│   ├── use-live.ts         ← React hook over SSE
│   └── tournament-views.ts ← server-only DB → component VMs
└── db/
    ├── schema.ts           ← users, transactions, tournaments, groups, players,
    │                         matches, legs, markets, market_selections, bets,
    │                         app_settings
    └── migrations/
```

## Specs and plans

Design and implementation history under `docs/superpowers/`:
- `specs/2026-05-24-darts-tournament-design.md` — single spec
- `plans/2026-05-24-phase-{1..4}-…md` — phased rollout (foundation,
  tournament engine, odds + betting, realtime + specials)

## Testing

```bash
npm test               # vitest unit + integration
npm run test:e2e       # playwright (one-off: npx playwright install chromium)
npm run lint           # eslint
npm run type-check     # tsc --noEmit
```

## Deploying to Vercel

Tested-but-not-bulletproof. See `DEVELOPMENT.md` for the Vercel +
Neon path. The in-process event bus needs swapping for Pusher/Ably/
Upstash before multi-instance prod.

## License

MIT
