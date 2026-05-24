# Darts Tournament System — Design Spec

**Date:** 2026-05-24
**Status:** Approved (pending user review of written spec)

## 1. Purpose & Scope

Web system for managing a local darts tournament with virtual-currency betting. Supports configurable group-stage + knockout-bracket format, multiple bet markets including live per-leg bets, and real-time odds and result updates. Two user roles: regular users (bet, profile, history) and admin (full tournament management).

**Scale:** 8–10 players per tournament, single active tournament at a time.

**Out of scope (MVP):** Real-money payments, multi-tournament concurrency, mobile native apps, email verification, OAuth providers.

## 2. Architecture

### Stack

- **Frontend:** Next.js 15 (App Router) + React 19 + TypeScript, shadcn/ui + Tailwind v4
- **Backend:** Next.js Route Handlers + Server Actions (fullstack)
- **Database:** PostgreSQL on Neon, Drizzle ORM
- **Auth:** NextAuth.js v5 (credentials provider, JWT sessions, Argon2id password hashing)
- **Real-time:** Pusher Channels (server publish, client subscribe)
- **File uploads:** UploadThing or Vercel Blob (avatars)
- **Validation:** Zod (shared between server and client)
- **Deployment:** Vercel

### Subsystems

The application is split into three logical engines with clear boundaries:

1. **Tournament Engine** — manages tournament state (draft → groups → playoff → finished), generates matches, records results, recomputes standings. Has no knowledge of betting.
2. **Odds Engine** — reads from Tournament Engine (player stats, match results) and Betting Engine (bet volume). Computes statistical odds, parimutuel odds, and blended final odds. Never writes back to those engines.
3. **Betting Engine** — sole source of truth for user capital and bets. Accepts bets in serializable transactions, settles markets, handles refunds and audit trail.

## 3. Data Model

### Tables

**users**
- `id`, `email` (unique), `password_hash` (Argon2id), `username` (unique, 3–20 chars), `avatar_url`, `bio`, `role` ('user' | 'admin'), `capital` (decimal(12,2)), `created_at`

**tournaments**
- `id`, `name`, `status` ('draft' | 'groups' | 'playoff' | 'finished'), `config_json` (jsonb — group_count, group_size, advance_per_group, best_of per phase, third_place_match boolean, cross_seeding_pattern, enabled_markets array, starting_capital, max_stake_pct, parimutuel_threshold), `created_at`, `started_at`, `finished_at`

**players** (tournament participants, distinct from users)
- `id`, `tournament_id`, `name`, `avatar_url`, `group_id` (nullable), `seed` (nullable), `elo_rating` (default 1500)

**groups**
- `id`, `tournament_id`, `name` (e.g., "A", "B"), `position` (display order)

**matches**
- `id`, `tournament_id`, `phase` ('group' | 'quarter' | 'semi' | 'final' | 'third_place'), `group_id` (nullable, only for group-phase matches), `bracket_round` (nullable, for playoff), `bracket_position` (nullable, for playoff seeding), `player_a_id`, `player_b_id`, `best_of` (3, 5, 7, ...), `status` ('scheduled' | 'live' | 'finished' | 'cancelled'), `score_a` (legs won), `score_b`, `winner_id`, `starts_at`, `finished_at`
- Optional stat fields (when enabled): `avg_a`, `avg_b`, `t20_a`, `t20_b`

**legs**
- `id`, `match_id`, `leg_number`, `winner_id`, `status` ('pending' | 'live' | 'finished'), `started_at`, `finished_at`

**markets** (a bettable instance)
- `id`, `match_id` (nullable, for tournament-scope markets), `tournament_id` (always), `type` (enum — see Market Types below), `scope` ('match' | 'group' | 'tournament'), `group_id` (nullable), `leg_id` (nullable), `player_id` (nullable, for per-player markets), `status` ('open' | 'closed' | 'settled' | 'cancelled'), `opens_at`, `closes_at`, `settled_at`

**market_selections** (possible outcomes within a market)
- `id`, `market_id`, `label` (e.g., "Karel" or "2:1"), `player_id` (nullable), `score_a` (nullable), `score_b` (nullable), `over_under_value` (nullable), `stat_odds` (decimal), `pari_odds` (decimal, nullable), `final_odds` (decimal), `is_winner` (boolean, set at settlement)

**bets**
- `id`, `user_id`, `selection_id` (→ market_selections), `stake` (decimal(12,2)), `locked_odds` (decimal, captured at placement), `status` ('open' | 'won' | 'lost' | 'refunded'), `payout` (decimal, nullable until settled), `placed_at`, `settled_at`

**transactions** (immutable capital audit log)
- `id`, `user_id`, `type` ('initial' | 'bet_placed' | 'bet_won' | 'bet_refund' | 'admin_adjust' | 'tournament_reset'), `amount` (signed decimal), `balance_after` (decimal), `bet_id` (nullable), `note`, `created_at`, `created_by` (nullable, admin user id)

### Key Decisions

- **Player ≠ User.** Tournament players are entities created by admin (with name and avatar). Users have accounts and bet but are not required to be players.
- **Locked odds at bet time.** When a user places a bet, `final_odds` at that moment is captured into `bets.locked_odds`. Parimutuel movement after placement does not affect that user's payout.
- **`transactions` as immutable audit log.** Every capital change has a row. Enables debugging discrepancies and showing user history.
- **`config_json` for tournament settings.** Flexible storage for the many admin-configurable knobs.
- **ELO rating per player** (not per user). Initialized to 1500 at tournament start; updated after each finished match.

## 4. Tournament Flow

```
draft → groups → playoff → finished
```

### Admin configuration (draft phase, fully editable)

- `group_count` (default 2)
- `group_size` (default 4)
- `advance_per_group` (default 2)
- `best_of` per phase (defaults: groups 3, quarter 5, semi 5, final 7)
- `third_place_match` (default false)
- `cross_seeding_pattern` (default A1 vs B2)
- `starting_capital` (default 1000)
- `max_stake_pct` (default 50%)
- `enabled_markets` (array — which market types are available)
- `parimutuel_threshold` (default 5000, controls stat → pari blending)
- `house_edge` (default 0% for virtual currency; configurable up to 10%)
- `total_legs_line` (default `floor(best_of/2) + 0.5`, configurable per phase)
- `triple_20s_line` (default 50, configurable — Over/Under threshold for tournament-wide T20 count)

### During tournament (limited editability)

Admin can:
- Change `best_of` for unstarted matches
- Reschedule match start times
- Cancel a match (refunds all open bets)
- Manually correct a recorded result (reverses prior settlement, re-settles)
- Adjust user capital (with required note, audit-logged)

Admin cannot (post-start):
- Change group structure (count, size, members)
- Change scoring rules

### Phases

1. **Draft:** Admin creates tournament, adds players, assigns to groups (drag-drop or random), reviews config, clicks "Start groups."
2. **Groups:** Each group plays round-robin independently. Match scoring: 3 pts for 2:0 win, 2 pts for 2:1 win, 1 pt for 1:2 loss, 0 pts for 0:2 loss. When all group matches finished, admin clicks "Create bracket."
3. **Playoff:** Top N from each group seeded into bracket via cross-seeding (A1 vs B2, B1 vs A2). System auto-advances winners. Optional third-place match between semifinal losers.
4. **Finished:** Display final standings, top bettors leaderboard, payouts.

## 5. Bet Markets

### Match-level markets

| Market | Opens | Closes | Selections |
|---|---|---|---|
| Match Winner | match created | first leg starts | Player A / Player B |
| Correct Score | match created | first leg starts | All possible scores per best_of |
| Leg Winner | previous leg finishes (or match start for leg 1) | leg starts | Player A / Player B |
| Total Legs Over/Under | match created | first leg starts | Over X.5 / Under X.5 (X = floor(best_of/2)) |
| First Leg Winner (opt-in) | match created | first leg starts | Player A / Player B |
| Will Go to Decider (opt-in) | match created | first leg starts | Yes / No |

### Tournament-level markets (futures)

| Market | Opens | Closes | Selections |
|---|---|---|---|
| Tournament Winner | groups start | playoff starts | all players |
| Group Winner (per group) | groups start | group finishes | players in group |
| Reach Playoff (per player) | groups start | group finishes | Yes / No |
| Reach Final (per player) | playoff starts | final starts | Yes / No |
| Podium Finish (per player) | groups start | semifinal starts | Yes / No |

### Special markets (opt-in, require admin to record extra stats)

| Market | Requires admin to record |
|---|---|
| Highest Average (per tournament) | match averages per player |
| Triple 20s Total Over/Under (per tournament) | T20 hits per match per player |
| Most Triple 20s (per tournament) | T20 hits per match per player |

(180s explicitly excluded — too rare for amateur play.)

## 6. Odds Engine

Each `market_selection` carries three odds values:

- `stat_odds` — baseline from player statistics
- `pari_odds` — parimutuel from bet volume (nullable if no bets)
- `final_odds` — blended value shown to users

### `stat_odds` computation

- **Match Winner / Leg Winner / First Leg:** ELO-based. `P(A wins) = 1 / (1 + 10^((rating_B - rating_A) / 400))`. Ratings start at 1500, update after each finished match via standard ELO with K=32.
- **Correct Score:** Derived from match-winner probability and empirical leg-margin distribution. Example for best-of-3 with P(A)=0.7: P(2:0)≈0.49, P(2:1)≈0.21, P(1:2)≈0.21, P(0:2)≈0.09.
- **Tournament Winner / Group Winner / Reach Playoff / Reach Final / Podium:** Monte Carlo simulation (N=10000) using current ELO ratings and remaining schedule. Recomputed after each finished match. Cached for 60s to avoid recomputation per page load.
- **Total Legs / Will Go to Decider:** Derived from match-winner probability and expected leg-margin distribution.
- **Highest Average / Most T20s:** Bayesian update from accumulated stats during tournament. Initialized to uniform (1/N).

Probability → odds conversion: `odds = (1 / probability) * (1 - house_edge)`. Default `house_edge` is 0% for virtual currency (admin-configurable per tournament).

### `pari_odds` computation

Standard parimutuel per market:
```
total_pool = sum(stake) across all bets in this market
pool_on_selection = sum(stake) on this selection
pari_odds = (total_pool * (1 - rake)) / pool_on_selection
```

`rake` defaults to 0% for virtual currency. If `pool_on_selection == 0`, `pari_odds` is NULL.

### `final_odds` blending

```
α = min(total_pool / parimutuel_threshold, 1)
if pari_odds is NULL:
  final_odds = stat_odds
else:
  final_odds = α * pari_odds + (1 - α) * stat_odds
```

Effect: when bet volume is low, statistical odds dominate. As volume approaches `parimutuel_threshold`, parimutuel takes over.

### Recompute triggers

- New bet placed → recompute `pari_odds` + `final_odds` for that market → publish event.
- Match finishes → update ELO → recompute `stat_odds` for all open markets touching those players → publish events.
- Per-player stat recorded (avg, T20) → recompute relevant special markets.

Implementation: `OddsService.recalculate(market_id)` is invoked from Server Actions after the triggering write, in the same transaction where possible.

## 7. Auth, Roles, Profiles, Capital

### Authentication

- NextAuth.js v5, credentials provider (email + password)
- Argon2id password hashing
- JWT sessions, 7-day expiry, refresh on activity
- No OAuth in MVP

### Registration

- Fields: email, username (3–20 chars, alphanumeric + underscore, unique), password (min 8 chars)
- On creation: if an active tournament exists, `capital = tournament.starting_capital`; otherwise `capital = 0`
- First registered user becomes admin (bootstrap)

### Roles

- `user` (default): bet, profile, history, leaderboard
- `admin`: all of the above + tournament/player/match/market management, capital adjustments, audit log access
- Admin can promote/demote other users

### Profile

- Public profile at `/u/[username]`: username, avatar, bio, capital, total_won, total_lost, win_rate, recent bets
- Avatar upload via UploadThing, max 2MB, jpg/png/webp, client-side crop to square

### Capital

- `decimal(12, 2)` precision
- All changes go through `BettingService` in transactions, always with a `transactions` row
- Admin manual adjustments require a note
- At new tournament start, admin chooses whether to reset all users' capital to `starting_capital` or carry over

## 8. Real-time Events (Pusher)

### Channels

- `tournament:{id}` (public) — overall tournament updates
- `match:{id}` (public) — single match updates
- `market:{id}` (public) — odds and bet flow per market
- `user:{user_id}` (private, auth-gated) — personal updates

### Event matrix

| Channel | Event | Payload | Trigger |
|---|---|---|---|
| tournament:{id} | status_changed | new status | admin advances phase |
| tournament:{id} | groups_updated | full group tables | match finished |
| tournament:{id} | bracket_updated | bracket structure | playoff match finished |
| match:{id} | started | match data | admin starts match |
| match:{id} | leg_started | leg_number, leg_id | admin starts leg |
| match:{id} | leg_finished | leg_id, winner, current score | admin records leg result |
| match:{id} | finished | final score, winner | last leg recorded |
| match:{id} | cancelled | reason | admin cancels |
| market:{id} | odds_changed | per-selection odds | new bet or recalc |
| market:{id} | closed | — | close condition met |
| market:{id} | settled | winning selection | settlement complete |
| user:{id} (private) | bet_settled | bet_id, result, payout, new capital | settlement |
| user:{id} (private) | capital_changed | new capital, delta, reason | any capital change |

### Client

- Custom `usePusherChannel(channel, eventHandlers)` React hook with subscribe/unsubscribe lifecycle.
- Pages subscribe only to what they need (homepage → tournament; match detail → match + each market on it).
- Optimistic UI on bet placement: deduct capital locally, confirm via `user:{id}:bet_settled` (or rollback on server error).

## 9. Frontend Structure

```
app/
  (auth)/
    login/page.tsx
    register/page.tsx
  (app)/
    layout.tsx                  ← Sidebar, UserMenu, CapitalDisplay
    page.tsx                    ← Homepage: active tournament, featured matches
    tournament/
      page.tsx                  ← Overview: groups tables, bracket preview
      bracket/page.tsx          ← Full-screen interactive bracket
    match/[id]/page.tsx         ← All markets, betting UI, live updates
    bets/page.tsx               ← My bets (active + history)
    leaderboard/page.tsx        ← User ranking by profit
    u/[username]/page.tsx       ← Public user profile
    settings/page.tsx           ← Avatar, password, etc.
  admin/
    layout.tsx                  ← Admin guard
    page.tsx                    ← Dashboard
    tournaments/
      page.tsx
      new/page.tsx              ← Wizard
      [id]/page.tsx
      [id]/players/page.tsx
      [id]/matches/page.tsx     ← Record results, control legs
    users/page.tsx              ← Capital management
    audit/page.tsx              ← Transaction log
  api/
    auth/[...nextauth]/route.ts
    pusher/auth/route.ts        ← Private channel auth
    uploadthing/route.ts
```

### Key components

- `<BracketView>` — custom SVG renderer for playoff bracket (avoids heavy library deps)
- `<GroupTable>` — group standings (shadcn Table)
- `<MarketCard>` — single market with odds buttons; click opens `<BetDialog>`
- `<BetDialog>` — stake input, potential payout calc, locked-odds display
- `<LiveOddsBadge>` — odds with pulse animation on change
- `<CapitalDisplay>` — animated capital in topbar
- `<MatchHeader>` — score, status, format info

### shadcn components used

Button, Card, Dialog, Form, Input, Select, Table, Tabs, Toast (Sonner), Sheet, Avatar, Badge, Progress, Skeleton, DropdownMenu, Tooltip, Separator, Alert, ScrollArea

### Theme

Dark mode default; accent color inspired by traditional pub dartboard (dark green / orange).

## 10. Error Handling & Edge Cases

### Concurrency

- **Bet placement:** SERIALIZABLE transaction. Atomically: check `capital >= stake`, check `market.status = 'open'`, INSERT bet, UPDATE capital, INSERT transaction. Retry up to 3x on serialization conflict.
- **Settlement:** Row-level locks on all bets in the market being settled.

### Stale market state

- Server re-validates `market.status = 'open'` inside the bet transaction. If closed since the client loaded, return clear error → client rolls back optimistic UI.

### Match cancellation

- All `open` markets on that match → `cancelled`
- All `open` bets → `refunded`; capital restored; transactions written
- `match:{id}:cancelled` event published

### Manual result correction

- Admin marks "rewrite result"
- System reverses prior settlement (peníze zpět), records new result, re-settles
- Both actions captured in audit log

### Validation (Zod)

- `stake > 0`, `stake <= user.capital`, `stake <= floor(user.capital * max_stake_pct)` (computed against current capital at bet time)
- Selection belongs to an `open` market
- Match status valid for the requested admin action

### Limits

- Min stake: 1 unit
- Max stake: per-tournament `max_stake_pct` (default 50% of current capital)

### Empty / loading states

- Skeleton components for tables, brackets, odds while loading
- Empty-state copy for "no active tournament", "no markets open", "no bets yet"
- Sonner toasts for bet placement, win/loss, capital changes, errors

## 11. Testing

### Unit (Vitest)

- `OddsService`: ELO updates, stat_odds per market type, parimutuel formula, blending. Snapshot tests for deterministic computations.
- `BettingService`: placement validation, settlement, refund.
- `TournamentService`: group-stage match generation, group standings, bracket creation, cross-seeding.

### Integration (Vitest + embedded Postgres or testcontainers)

- Full flow: create tournament → add players → start groups → play matches → start playoff → bet → settle → verify capitals and transactions.
- Concurrent betting: 5 parallel inserts; capital never goes negative.
- Settlement: after match finishes, all bets have correct status + payout; capitals reconcile.

### E2E (Playwright)

- Login → place bet → receive live odds update (mock Pusher).
- Admin: create tournament → add players → start groups → record match.
- Only critical paths.

### Manual scenarios (pre-release)

- Two browsers betting on same match simultaneously
- Pusher reconnect after network drop
- Multi-day tournament run

### CI

GitHub Actions on each PR: lint + typecheck + unit + integration.

## 12. Open Questions / Future Work

- Email verification (not in MVP)
- Multiple concurrent tournaments
- Mobile-optimized layouts beyond responsive
- Real-money mode (legally significant — separate spec)
- Historical analytics dashboards
- Tournament templates (save/load configurations)
