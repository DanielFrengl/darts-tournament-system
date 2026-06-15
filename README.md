# Jabloňová Open — Darts Tournament System

End-to-end web app for running a local darts tournament: bracket
management, real-time scoreboard, virtual-currency parimutuel betting
(including bet builder / accumulators), admin tools, and a public TV
display.

Designed for an evening with 8–10 friends and a dartboard; everything
runs on a single laptop or a free Railway dyno.

## Highlights

**For players**
- Register with first + last name and an invite code; the username is
  auto-slugged from the name and used only for `/u/{username}` URLs.
- Capital is denominated in **jablka** and resets at the start of every
  tournament — every event starts on a level playing field; all-time
  net profit lives in the audit log and the leaderboard.
- **Sázení** (`/sazeni`) is one page with two modes:
  - *Jednoduchá* — click a kurz on a match card, BetDialog opens, place
    a single bet. Markets are grouped by match, live ones at the top.
  - *Bet builder* — toggle on, pick 2–10 selections from different
    markets, slip on the side shows combined kurz + potential payout,
    submit one stake on the parlay.
- Match detail page lists markets in Tipsport order: **Live legs** (top
  when the match is live) → **Hlavní trh** (vítěz zápasu) → **Vedlejší
  trhy** (přesný výsledek).
- Dashboard combines featured matches (clickable odds), top-5
  tournament leaderboard, and your own stats (kapitál, otevřené sázky,
  čistý zisk, úspěšnost).
- `/leaderboard` has tabs for *Aktuální turnaj* and *Celkově*, plus
  switchable bar / donut / line charts.
- `/u/{username}` shows the player's profile with current-tournament
  and all-time betting stats side by side.
- `/elo` lists every competitor by carried ELO (strength across events).
- **Nahlásit chybu** button in the sidebar sends a bug report (text +
  who / which page / when) straight to a Discord webhook.

**For the admin**
- Tournament wizard is automated end-to-end: configure → add players →
  start groups → score one match at a time on `/admin/tournaments/[id]/play`
  → bracket auto-creates when the last group match finishes → tournament
  auto-finishes and settles all futures when the final ends.
- *Manuální fallback* — if the auto-trigger ever doesn't fire, the
  tournament detail page surfaces a "Vytvořit pavouka" CTA.
- Strong config validation: `groupCount × advancePerGroup` must be a
  power of 2; an inline banner with one-click recovery appears whenever
  the math doesn't add up (works in draft AND groups phase).
- Players can be linked to registered accounts (display name +
  avatar follow) or added as offline free-text entries.
- Edit / delete tournament from the detail page (delete only allowed
  in draft or finished).
- System settings: tournament name, system logo (UploadThing), invite
  code (regen button gives a fresh base32 code).

**TV display (`/display`, no login)**
- Big tournament name + logo + elapsed time since start.
- Live matches in 60pt score, with odds and total wagered pool.
- *"Na řadě"* list of upcoming matches with their odds.
- Phase-aware hero: group standings during groups (advancing rows
  highlighted), full playoff bracket once playoff starts.
- Bracket renders the **whole scaffold** from day one — semis and
  finals show up as faded placeholder cards ("Vítěz Q1 / Q2") and fill
  in as winners advance. Live match has a pulsing red glow + LIVE
  chip.
- Auto-hiding close button: visible only when the cursor approaches an
  edge; ESC also exits.
- Rotating darts trivia footer.

## Betting model

Decimal odds per selection are a hybrid of two sources:

1. **Statistical** — ELO win probability per leg `P = 1 / (1 + 10^((Rb − Ra) / 400))`
   feeds a closed-form correct-score distribution
   `P(N:K) = C(N+K−1, K) · pA^N · (1 − pA)^K`. Match-winner is the sum
   of the rows where the player reaches the target leg count first.
   Convert to decimal odds: `kurz = (1 / p) · (1 − houseEdge)`. Default
   `houseEdge = 0`.
2. **Parimutuel** — `kurz = (totalPool · (1 − rake)) / poolOnSelection`.

The two are blended by total pool:
```
alpha = min(totalPool / parimutuelThreshold, 1)
final_kurz = alpha · pari_kurz + (1 − alpha) · stat_kurz
```
With `parimutuelThreshold = 5000`, the first chips of the pool barely
shift the price; once the pool hits the threshold the market fully
takes over.

**Accumulators** lock the product of the legs' odds at placement time:
`acc_kurz = Π kurz_i`, payout = `stake × acc_kurz` if every leg wins.
Any loss → bust. Any refund → the whole parlay is refunded.

ELO ratings update after each match (`K = 32`) so subsequent rounds
re-price using the latest numbers.

**Tournament-winner / place futures** (`tournament_winner`, `runner_up`,
`third`) are priced by a **Monte Carlo simulation** (`lib/tournament-sim.ts`):
the whole event (groups → bracket) is simulated ~10 000× from player ELO,
and each player's win / runner-up / third frequency becomes their
probability (replacing the old uniform `1/N`). The admin `/admin/tournaments/[id]/odds-viz`
page visualises win-probability, convergence, phase-reach and placement
distribution.

## Cross-tournament ratings & history import

Player strength persists across events via a **`competitors`** table
(canonical `eloRating`); each per-tournament `players` row links to a
competitor (`competitorId`) and is seeded from it. On tournament finish,
the working ELO is written back to the competitor.

- **Import past tournaments** from the "Jabloňová Open" export format
  (`{ groups, scores: "A-B=2:0" }`) and replay ELO chronologically:
  `npm run import-tournaments data/open1.json data/open2.json … [+Newcomer]`.
  Trailing `+Name` args seed pure newcomers at 1500.
- **Manual override** — admins can set a competitor's ELO in
  `/admin/competitors`; it is **locked** (`eloLocked`) so re-imports
  don't overwrite it (unlock to recompute).
- **Roster** — add existing competitors (seeded ELO) or newcomers to a
  tournament from `/admin/tournaments/[id]/players`.
- **Public read views**: `/elo` (live player-strength table) and
  `/info` (link-only, `noindex` announcement page).

## Tech stack

- **Next.js 16** (App Router, RSC, server actions) + **React 19**
- **PostgreSQL 16** via **Drizzle ORM** (postgres-js driver)
- **NextAuth v5** with credentials provider; Argon2id via
  `@node-rs/argon2`. JWT re-reads role from the DB on every request so
  promotions/demotions take effect without re-login.
- **shadcn/ui** v4 + Tailwind v4 with custom layered surfaces
  (`--card`, `--card-elevated`) and `--shadow-card` for depth.
- Light + dark themes via `next-themes`, system-aware with manual
  toggle in the header.
- **UploadThing** for avatars + system logo (optional).
- **Recharts** for the leaderboard's bar / donut / line variants.
- **Server-Sent Events** + in-process pub/sub for real-time updates
  (swap to Pusher/Ably for multi-instance deploys).
- **Lucide** icons; **Geist Sans + Mono** via `next/font/google`.

## Local development

```bash
# 1. Install
nvm use                # Node 20
npm install

# 2. Postgres
docker compose up -d   # darts @ :5432, darts_test @ :5433
# Or Homebrew:
#   brew install postgresql@16 && brew services start postgresql@16
#   createuser -s darts; createdb -O darts darts; createdb -O darts darts_test

# 3. Env
cp .env.example .env
echo "AUTH_SECRET=\"$(openssl rand -base64 32)\"" >> .env
# Optional: route "Nahlásit chybu" reports to Discord
# echo 'DISCORD_BUG_WEBHOOK_URL="https://discord.com/api/webhooks/…"' >> .env

# 4. Migrations
npm run db:migrate

# 5. Run
npm run dev            # ~30–90 s first-route compile
# or
npm run prod           # build + start, <100 ms per request
```

App at <http://localhost:3000>. TV display at
<http://localhost:3000/display>. The default invite code is `darts`;
change it under **Admin → Nastavení** after the first registration.
First registered user becomes admin automatically.

## Project structure

```
src/
├── app/
│   ├── (app)/
│   │   ├── page.tsx              ← dashboard (stats, featured matches, leaderboard widget)
│   │   ├── tournament/           ← live overview, groups, bracket, futures
│   │   ├── sazeni/               ← unified Sázení page (single + bet builder + history)
│   │   ├── leaderboard/          ← tournament vs all-time tabs, chart-type switcher
│   │   ├── match/[id]/           ← per-match markets, categorized Tipsport-style
│   │   ├── u/[username]/         ← public profile + per-tournament stats
│   │   ├── settings/             ← avatar / bio / password
│   │   ├── bets/                 ← (redirect → /sazeni)
│   │   └── bet-builder/          ← (redirect → /sazeni; actions still here)
│   ├── (auth)/                   ← login + register (invite code on register form)
│   ├── admin/                    ← gated: tournaments, users, audit, settings
│   ├── display/                  ← TV display (no login)
│   └── api/                      ← NextAuth, UploadThing, SSE, /api/health
├── components/
│   ├── ui/                       ← shadcn primitives + LiveDot
│   ├── layout/                   ← Sidebar (Turnaj / Sázení / Admin sections), MobileNav, UserMenu, ThemeToggle
│   ├── tournament/               ← BracketView (full scaffold + LIVE glow), MatchListCard, GroupTable, TvDisplay
│   ├── betting/                  ← MarketCard, BetDialog, BetBuilder, SazeniSurface (mode toggle), BetsByMatch
│   ├── admin/                    ← TournamentControls, TournamentAdminActions, AdvancePerGroupFix, PlayerManager, MatchRow, SystemSettingsForm, WizardNav
│   ├── user/                     ← CapitalDisplay (jablka), ProfileCard, ProfileStats, AvatarUpload
│   └── leaderboard/              ← LeaderboardCharts (bar / donut / line)
├── lib/
│   ├── tournament.ts             ← TournamentService (create, rename, delete, status transitions)
│   ├── player.ts                 ← PlayerService (offline + account-linked)
│   ├── match.ts                  ← MatchService (round-robin + standings)
│   ├── bracket.ts                ← BracketService (cross-seeding + advancement)
│   ├── leg.ts                    ← LegService
│   ├── match-lifecycle.ts        ← orchestrator: market lifecycle + auto-bracket + auto-finish
│   ├── market.ts                 ← MarketService (incl. tournament_winner/runner_up/third futures)
│   ├── betting.ts                ← BettingService: placeBet, placeParlay, settle/refund with parlay resolution
│   ├── capital.ts                ← CapitalService (atomic debit/credit + transactions audit)
│   ├── odds.ts                   ← pure odds math (binomial correct-score, parimutuel, blend)
│   ├── elo.ts                    ← ELO win-probability + rating updates
│   ├── tournament-sim.ts         ← pure Monte Carlo tournament simulation (futures odds)
│   ├── rating-replay.ts          ← replay ELO over an ordered match list
│   ├── import-format.ts          ← parser for the Jabloňová Open export JSON
│   ├── competitor.ts             ← seed from competitor, finish writeback, account link, elo override/lock
│   ├── bug-report.ts             ← format a bug report for the Discord webhook
│   ├── names.ts                  ← displayName helper + slug username generator
│   ├── user-stats.ts             ← shared betting stats (scoped or all-time)
│   ├── settings.ts               ← app_settings singleton + invite verification
│   ├── event-bus.ts              ← in-process pub/sub
│   ├── use-live.ts               ← React hook over SSE
│   └── tournament-views.ts       ← server-only DB → component VMs
└── db/
    ├── schema.ts                 ← users (+ first/last name), competitors (+ eloLocked),
    │                               transactions, tournaments, groups, players (+ competitorId),
    │                               matches, legs, markets, market_selections,
    │                               bets (+ parlay_id), parlays, app_settings
    └── migrations/               ← 0000…0013 (latest: competitors.eloLocked)
```

## Testing

```bash
npm test               # vitest unit + integration
npm run test:e2e       # playwright (one-off: npx playwright install chromium)
npm run lint           # eslint
npm run type-check     # tsc --noEmit
```

## Deploying

**Railway (recommended)** — see [`DEPLOY.md`](./DEPLOY.md) for a complete
walkthrough using the Railway CLI. The repo ships with `railway.json`,
`nixpacks.toml`, `scripts/migrate.mjs`, and `/api/health` preconfigured;
migrations run automatically before each boot and the DB client lazy-
inits so `next build` doesn't crash without `DATABASE_URL`.

**Vercel** — works but not exhaustively tested. See `DEVELOPMENT.md`
for the Vercel + Neon path.

Either way: the in-process event bus needs swapping for Pusher/Ably/
Upstash before scaling to multiple instances.

## License

MIT
