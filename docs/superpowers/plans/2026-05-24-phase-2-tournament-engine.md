# Phase 2: Tournament Engine Implementation Plan

> Inline execution from main session (Phase 1 already pinned the pattern).

**Goal:** Admin can create and run a darts tournament end-to-end: configure format, add players, assign to groups, generate round-robin matches, record leg-by-leg results, build the playoff bracket from top finishers, and finish the tournament. Users see live standings and the bracket. No betting yet.

**Architecture:** Pure server-side engines wrapped in service classes (`TournamentService`, `MatchService`, `BracketService`). Admin server actions delegate to services. Server-rendered pages read directly from the DB.

**Reference spec:** `docs/superpowers/specs/2026-05-24-darts-tournament-design.md` §3 (data model), §4 (flow), §10 (concurrency/edge cases)

## File Structure (added in Phase 2)

```
src/
├── db/
│   ├── schema.ts                            ← extend with tournaments, players, groups, matches, legs
│   └── migrations/0002_*.sql                ← generated
├── lib/
│   ├── tournament.ts                        ← TournamentService (CRUD, status transitions, config)
│   ├── player.ts                            ← PlayerService (add/remove/assign to group)
│   ├── match.ts                             ← MatchService (round-robin generation, standings)
│   ├── bracket.ts                           ← BracketService (cross-seed + advance winners)
│   ├── leg.ts                               ← LegService (start/record leg, finalize match)
│   └── tournament-config.ts                 ← Zod schemas + defaults for config_json
├── app/
│   ├── (app)/
│   │   ├── page.tsx                         ← updated dashboard: show active tournament
│   │   ├── tournament/page.tsx              ← user overview: groups + bracket preview
│   │   └── tournament/bracket/page.tsx      ← full-screen interactive bracket
│   └── admin/
│       └── tournaments/
│           ├── page.tsx                     ← list + "New tournament"
│           ├── new/page.tsx                 ← wizard
│           ├── new/actions.ts
│           ├── [id]/page.tsx                ← admin overview (controls, status)
│           ├── [id]/actions.ts
│           ├── [id]/players/page.tsx        ← player CRUD + group assignment
│           ├── [id]/players/actions.ts
│           ├── [id]/matches/page.tsx        ← record results, control legs
│           └── [id]/matches/actions.ts
└── components/
    ├── tournament/
    │   ├── GroupTable.tsx                   ← standings per group
    │   ├── BracketView.tsx                  ← custom SVG bracket
    │   ├── MatchCard.tsx                    ← compact match summary
    │   └── ScoreEntryDialog.tsx             ← admin records leg/match score
    └── admin/
        ├── PlayerAssignBoard.tsx            ← drag-drop or select-based group assignment
        └── TournamentConfigForm.tsx         ← config wizard
tests/
├── unit/
│   ├── tournament-config.test.ts
│   ├── round-robin-generator.test.ts
│   ├── standings.test.ts
│   └── bracket-seeding.test.ts
└── integration/
    ├── tournament-lifecycle.test.ts
    ├── match-recording.test.ts
    └── bracket-progression.test.ts
```

## Tasks

### Task 1 — Schema extension

Extend `src/db/schema.ts` with new tables: `tournaments`, `groups`, `players`, `matches`, `legs`. Generate + apply migration. Verify type exports.

### Task 2 — Tournament config (TDD)

`src/lib/tournament-config.ts` — Zod schemas for tournament config (group_count, group_size, advance_per_group, best_of per phase, third_place_match, starting_capital, max_stake_pct, enabled_markets, parimutuel_threshold, house_edge, total_legs_line, triple_20s_line). Defaults + validation rules (e.g., group_count × group_size <= player_count, advance_per_group × group_count >= 2). Unit tests.

### Task 3 — TournamentService (TDD)

`src/lib/tournament.ts` — create (draft), list, get, updateConfig (only in draft), transition (draft→groups, groups→playoff, playoff→finished). Reject invalid transitions. Integration tests.

### Task 4 — PlayerService (TDD)

`src/lib/player.ts` — add player (name, avatar, tournament_id), remove (only in draft), list per tournament. AssignToGroup, autoAssignRandom. Validation: can't add when not draft, can't assign once groups started. Integration tests.

### Task 5 — Round-robin generator + standings (TDD)

`src/lib/match.ts` — `generateRoundRobin(playerIds)` returns pairings (circle method). `computeStandings(matches, players)` returns per-group ranking by points (3/2/1/0), then leg diff, then h2h. Unit tests cover edge cases (3, 4, 5 players, odd counts).

### Task 6 — BracketService (TDD)

`src/lib/bracket.ts` — `createBracket(groupStandings, advancePerGroup, includeThirdPlace)` produces matches for quarter/semi/final + optional 3rd-place. Cross-seeding pattern (A1 vs B2, B1 vs A2). `advanceWinner(matchId)` writes the winner into the next bracket position. Unit tests cover 4/8 advancing players.

### Task 7 — LegService (TDD)

`src/lib/leg.ts` — `startLeg(matchId)` (creates new leg row, sets match to live if first leg), `recordLeg(legId, winnerId)` (sets winner, advances match score, finalizes match when best-of threshold reached). Concurrency: SERIALIZABLE transaction. Integration tests.

### Task 8 — Admin tournament list + new wizard

Routes: `/admin/tournaments` (list), `/admin/tournaments/new` (wizard). Server actions for create. Use `TournamentConfigForm`. Form posts to action → redirect to `/admin/tournaments/[id]`.

### Task 9 — Admin tournament detail + status controls

Route: `/admin/tournaments/[id]` — shows status, config summary, player count, controls: "Start groups" (validates: enough players, groups assigned), "Create bracket" (validates: all group matches done), "Finish tournament" (validates: final played). Server actions for transitions. Cancel match button.

### Task 10 — Admin players page (assignment)

Route: `/admin/tournaments/[id]/players` — add/remove player form, group assignment (drop-down or simple Select per player). "Auto-assign random" button.

### Task 11 — Admin matches page (record results)

Route: `/admin/tournaments/[id]/matches` — list of upcoming + live + finished matches. Click a match → ScoreEntryDialog with leg-by-leg controls ("Start leg N", "Player A won leg N" / "Player B won leg N"). Cancel match.

### Task 12 — User tournament overview

Route: `/tournament` — shows active tournament. If status=groups: GroupTables for each group. If status=playoff/finished: GroupTables (final) + BracketView preview + link to full bracket. Empty state if no active tournament.

### Task 13 — User full-screen bracket

Route: `/tournament/bracket` — full-screen BracketView.

### Task 14 — Dashboard update

Update `/` (dashboard) to show active tournament summary, next match, link to tournament page.

### Task 15 — Polish + final verification

Add tournament link to sidebar (already there as `/tournament`). Verify build + type-check + lint + all tests pass. Tag `phase-2-tournament-engine`.
