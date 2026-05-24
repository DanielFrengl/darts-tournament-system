# Phase 3: Odds + Betting Implementation Plan

> Inline execution from main session.

**Goal:** Users can place bets on match-level markets (match winner, correct score, leg winner) using virtual capital. Odds are a hybrid of ELO-based statistical baseline + parimutuel from bet pool, blended by a threshold. Bets settle atomically on match/leg finish.

**Out of scope for Phase 3:** Tournament-level futures (tournament winner, group winner, reach playoff), special markets (highest average, T20s), real-time Pusher events. Those land in Phase 4.

**Architecture:**
- `OddsCalculator` — pure functions (ELO win prob, correct-score distribution, parimutuel formula, blend).
- `MarketService` — creates/closes/settles markets in response to match lifecycle events.
- `BettingService` — atomic bet placement (SERIALIZABLE + SELECT FOR UPDATE), payout/refund flowing through `CapitalService`.
- Hook into existing `LegService` and tournament transitions to fire market lifecycle events.

**Reference spec:** `docs/superpowers/specs/2026-05-24-darts-tournament-design.md` §5 (markets), §6 (odds engine)

## File Structure (added in Phase 3)

```
src/
├── db/
│   ├── schema.ts                            ← extend with markets, market_selections, bets
│   └── migrations/0003_*.sql
├── lib/
│   ├── elo.ts                               ← ELO update helpers
│   ├── odds.ts                              ← pure odds math (no DB)
│   ├── market.ts                            ← MarketService (create/close/settle)
│   ├── betting.ts                           ← BettingService (place, settle, refund)
│   └── match-lifecycle.ts                   ← orchestrator: hooks Leg/Match changes → market changes
├── app/
│   ├── (app)/
│   │   ├── match/[id]/page.tsx              ← match detail with market cards
│   │   ├── bets/page.tsx                    ← my bets (active + history)
│   │   └── page.tsx                         ← dashboard surfaces open markets too
│   └── admin/tournaments/[id]/matches/actions.ts  ← extend with settlement hook
└── components/
    └── betting/
        ├── MarketCard.tsx
        ├── BetDialog.tsx
        └── MyBetsTable.tsx
tests/
├── unit/
│   ├── elo.test.ts
│   ├── odds.test.ts
│   └── parimutuel.test.ts
└── integration/
    ├── market-lifecycle.test.ts
    └── betting.test.ts
```

## Tasks

### Task 1 — Schema: markets, market_selections, bets

Extend `src/db/schema.ts`. `markets`: id, tournament_id, match_id (nullable), type enum, scope, group_id/leg_id/player_id nullable, status, opens_at, closes_at, settled_at. `market_selections`: id, market_id, label, player_id, score_a, score_b, stat_odds, pari_odds, final_odds, is_winner. `bets`: id, user_id, selection_id, stake numeric(12,2), locked_odds numeric(8,4), status enum, payout, placed_at, settled_at. Add foreign keys + indexes. Generate + apply migration.

### Task 2 — ELO module (TDD)

`src/lib/elo.ts` — `winProbability(ratingA, ratingB)` and `updateRatings(ratingA, ratingB, winner, k=32)`. Unit tests covering symmetry, k-factor effect, edge cases (equal ratings → 0.5).

### Task 3 — Odds module (TDD)

`src/lib/odds.ts` — `correctScoreDistribution(pA, bestOf)` returns map of score → probability. `parimutuelOdds(totalPool, poolOnSelection, rake)`. `blendOdds(statOdds, pariOdds, totalPool, threshold)`. `probabilityToOdds(p, houseEdge)`. Unit tests: best-of-3/5/7 distributions sum to 1, parimutuel formula, blend formula edge cases.

### Task 4 — MarketService (TDD)

`src/lib/market.ts` — `createForMatch(matchId)` creates match_winner + correct_score markets with selections (using current stat odds). `createLegMarket(matchId, legNumber)` creates leg winner market when a leg starts. `closeMarket(marketId)` sets status. `settleMatchMarkets(matchId, winnerId, scoreA, scoreB)`. `settleLegMarket(legId, winnerId)`. `recomputeOdds(marketId)` for parimutuel updates. Integration tests against the full DB.

### Task 5 — BettingService (TDD)

`src/lib/betting.ts` — `placeBet(userId, selectionId, stake)` SERIALIZABLE transaction: validate market open, validate stake ≤ user.capital × max_stake_pct, debit via CapitalService, insert bet with locked_odds=current final_odds, then trigger market recomputeOdds (so next bettor sees moved pari). `settleSelection(selectionId, isWinner)` credits payout. `refundMarket(marketId)`. `listBets(userId)`. Integration tests including concurrent bet placement.

### Task 6 — Match lifecycle hooks

`src/lib/match-lifecycle.ts` — orchestrator. Called from:
- Match creation (group/playoff) → `MarketService.createForMatch`
- `LegService.startLeg` → close prior leg market if open, close match_winner + correct_score on first leg
- `LegService.recordLeg` → settle leg market, create next leg market if not yet at best-of threshold
- `LegService.cancelMatch` → refund all open markets on match
- Match finishes naturally → settle match-level markets
- Tournament transition to playoff → markets exist for each playoff match created by BracketService

Update `match.ts`, `bracket.ts`, `leg.ts` to call these hooks. Integration tests cover full happy path.

### Task 7 — Match detail page

`/match/[id]` — public match detail. Shows score, players, status, list of MarketCards (match_winner, correct_score, any open leg markets). Click a selection opens BetDialog.

### Task 8 — BetDialog

Stake input, displays locked-odds preview and potential payout. Server action calls BettingService.placeBet. Optimistic local update of capital on success.

### Task 9 — My bets page

`/bets` — table of all user's bets with status, stake, locked_odds, payout, links to match. Filter by status (open/won/lost/refunded).

### Task 10 — Dashboard markets row

Update dashboard to surface a few open match_winner markets users can bet on.

### Task 11 — Final verification + tag

Run lint + type-check + tests + build. Tag `phase-3-odds-betting`.
