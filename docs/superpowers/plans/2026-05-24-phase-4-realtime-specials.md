# Phase 4: Real-time + Specials + Polish

> Inline execution from main session.

**Goal:** Live odds/score updates across all clients without manual refresh, ELO ratings that learn from played matches, tournament-level futures markets (tournament winner, group winner, reach playoff), leaderboard, and end-of-phase polish.

**Real-time approach:** In-process EventBus + Server-Sent Events route. No external service required — works on a single Node process (local server or Vercel function with `force-dynamic`). The interface is intentionally Pusher-compatible (`channel:event`) so a future swap to Pusher is a config change, not a refactor.

**Reference spec:** `docs/superpowers/specs/2026-05-24-darts-tournament-design.md` §5 (futures markets), §7 (real-time events), §6 (ELO update)

## Tasks

### Task 1 — EventBus + SSE infra

`src/lib/event-bus.ts` — Node EventEmitter-based pub/sub keyed by channel. `src/app/api/events/route.ts` — SSE endpoint that subscribes to requested channels via query param, streams events as `data:` messages. `src/lib/use-live.ts` — React hook that opens an EventSource and invokes a callback per event.

### Task 2 — Wire EventBus into lifecycle

Emit events at the right moments:
- `tournament:{id}` → `status_changed`, `standings_updated`, `bracket_updated`
- `match:{id}` → `started`, `leg_started`, `leg_finished`, `finished`, `cancelled`
- `market:{id}` → `odds_changed`, `closed`, `settled`

Hook into `match-lifecycle.ts`, `tournament` admin actions, `MarketService.recomputeOdds`. Listeners trigger `router.refresh()` on the matching page.

### Task 3 — ELO update post-match (TDD)

Extend `match-lifecycle.onLegFinished` to update both players' ELO ratings when a match finishes. Winner gets the bigger swing per `updateRatings(ratingA, ratingB, "A"|"B")`. Persist to `players.elo_rating`. Tests cover: new match → markets reflect updated ratings.

### Task 4 — Tournament Winner market (TDD)

`MarketService.createTournamentWinner(tournamentId)` — call when tournament transitions to `groups`. Selections = all players, stat_odds via simple equal-weight (1/N) baseline (no Monte Carlo yet — future enhancement). Settlement when tournament transitions to `finished`: winner is the final match winner.

### Task 5 — Live updates on match detail

Add `<MatchLiveSync>` client component that uses `use-live.ts` to listen to `match:{id}` + each `market:{id}` and calls `router.refresh()`. Mount on `/match/[id]`.

### Task 6 — Live updates on tournament + dashboard

Mount the same pattern on `/tournament` (subscribes to `tournament:{id}`) and on dashboard.

### Task 7 — Leaderboard

`/leaderboard` — list of users ranked by capital delta vs starting amount (or just capital descending). Uses CapitalService transactions to compute net profit.

### Task 8 — Polish + tag

Verify build/lint/tests. Document SSE limitations in DEVELOPMENT.md. Tag `phase-4-realtime-specials`.
