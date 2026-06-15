# Player-facing Monte Carlo visualization

**Date:** 2026-06-15
**Status:** Approved

## Goal

Surface the tournament's Monte Carlo simulation to players. A rich
visualization already exists but is admin-only
(`/admin/tournaments/[id]/odds-viz`, component `OddsViz`). Players currently
only see the resulting odds on the betting screen. This adds a player-facing
page that shows the same simulation insight for the active tournament.

## Scope

- New player route `/sance` ("Šance"), in the `(app)` route group (gets the
  app shell + auth via `(app)/layout.tsx`).
- New sidebar entry in the **TURNAJ** section, after "Elo hráčů".
- Reuse the existing `OddsViz` component **verbatim** (all four charts:
  win→odds, convergence, reach-phase heatmap, placement distribution). No
  changes to the admin component or the simulation math.

Out of scope: theming `OddsViz`'s internal canvas palette to design tokens
(possible future polish), caching the simulation, mobile-specific layout work.

## Behavior

`src/app/(app)/sance/page.tsx` — async server component:

1. Resolve the active tournament with `tournamentService.getActive()`.
   - None → render `PageHeader` + a `Card` empty state: "Žádný aktivní turnaj".
2. Load `players` for that tournament.
   - Fewer than 2 → empty state: "Pro simulaci jsou potřeba aspoň 2 hráči."
3. Build `SimConfig` from `tournament.configJson` (same field mapping as the
   admin odds-viz page) and run
   `simulateTournament(players, simCfg, { runs: 10000 })` **per request**
   (matches admin; chosen for simplicity).
4. Render:
   - `PageHeader` title "Šance — Monte Carlo simulace", description
     `${t.name} · ${runs} běhů`.
   - One intro line of muted copy linking to `/info` ("…tisíckrát
     nasimulujeme turnaj…").
   - `<OddsViz sim={sim} names={names} houseEdge={cfg.houseEdge ?? 0} />`.

## Files touched

- **Add** `src/app/(app)/sance/page.tsx` — the page (modeled on
  `src/app/admin/tournaments/[id]/odds-viz/page.tsx`, but resolving the active
  tournament instead of a route param).
- **Edit** `src/components/layout/Sidebar.tsx` — add the `Šance` nav item
  (lucide `Dices` icon) to the `Turnaj` section after "Elo hráčů".

## Testing / verification

- `tsc --noEmit` and `eslint` clean.
- Manual: with a live seeded tournament, `/sance` renders all four charts;
  with no active tournament, the empty state shows; the nav item routes
  correctly and shows active state on `/sance`.

## Risks

- Running 10k sims per request is CPU-bound and synchronous. Acceptable at the
  expected tournament scale (8–16 players, modest concurrent users) and
  consistent with the existing admin page. If load becomes a problem, cache the
  `SimResult` keyed by tournament id + finished-match count (deferred).
