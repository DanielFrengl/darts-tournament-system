# Ruční úprava Ela + competitor → roster — návrh

**Datum:** 2026-06-14
**Stav:** schváleno k naplánování

## Cíl

Admin může (A) ručně přepsat Elo libovolného competitora na konkrétní číslo a
ta hodnota přežije další import (zámek), a (D) přidat existujícího competitora
do rosteru nového turnaje se seedem z jeho Ela (nebo přidat nováčka na 1500).

## Kontext

- `competitors` má `eloRating` (kanonická síla). `/admin/competitors` ji dnes
  zobrazuje read-only + napojení účtu + „Přepočítat kurzy".
- `import-tournaments` přehraje Elo a zapíše finální hodnoty na competitory.
- Roster turnaje: `addPlayer(name)` a `addPlayerFromUser(userId)`
  (`/admin/tournaments/[id]/players`). Helpery `addPlayerFromCompetitor` a
  `addNewcomer` už existují v `src/lib/competitor.ts`, ale nejsou v UI.

## A. Ruční override se zámkem

- **Schema:** přidat `competitors.eloLocked boolean not null default false`
  (+ migrace).
- **`/admin/competitors`:** rating editovatelný (inline number input + „Uložit").
  Uložení → `eloRating = hodnota`, `eloLocked = true`. U zamčených zobrazit
  indikátor zámku + tlačítko „Odemknout" (`eloLocked = false`).
- **Import:** v kroku zápisu ratingů `scripts/import-tournaments.ts` přeskočí
  competitory s `eloLocked = true` (nepřepíše ruční hodnotu). Nově zakládaní
  competitoři mají `eloLocked = false`.
- **Server akce** v `src/app/admin/competitors/actions.ts`:
  `setEloAction(competitorId, elo)` (admin guard, validace 0–4000, set + lock)
  a `unlockEloAction(competitorId)`.

## D. Competitor → roster nového turnaje

- Do `/admin/tournaments/[id]/players` přidat dvě cesty:
  - **Vybrat existujícího competitora** (který v daném turnaji ještě není) →
    `addPlayerFromCompetitor(db, tournamentId, competitorId)` (seed Ela + link).
  - **Přidat nováčka** (jméno) → `addNewcomer(db, tournamentId, name)`
    (založí competitora na 1500 + hráče).
- Server akce v `players/actions.ts`: `addFromCompetitorAction`,
  `addNewcomerAction` (admin guard, revalidate).
- Stávající `addPlayer`/`addFromUser` zůstávají.

## Dotčené soubory

- `src/db/schema.ts` + migrace — `competitors.eloLocked`.
- `scripts/import-tournaments.ts` — skip locked při zápisu.
- `src/app/admin/competitors/actions.ts` + `page.tsx` + `CompetitorLinker`
  (editovatelný rating, lock/unlock).
- `src/app/admin/tournaments/[id]/players/actions.ts` + `page.tsx` — přidání
  z competitora / nováčka.

## Testy

- Integration: `setElo` nastaví hodnotu + lock; import přeskočí locked
  competitory (rating se nezmění), neлocked se přepíše.
- `addPlayerFromCompetitor` / `addNewcomer` už pokryté v
  `tests/integration/competitor.test.ts`.

## Mimo rozsah (YAGNI)

- Ukládání „computed" hodnoty pro revert (unlock jen umožní příští přepočet).
- Nudge tlačítka (+/−) a startovní Elo per-nováček mimo 1500.
