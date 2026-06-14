# Trvalé ratingy a kurzy napříč turnaji — návrh

**Datum:** 2026-06-14
**Stav:** schváleno k naplánování

## Cíl

Přenášet sílu hráče (Elo) mezi turnaji, z historie 2 odehraných turnajů spočítat
„začátečnické kurzy" pro nový turnaj, po každém turnaji rating automaticky
aktualizovat a umožnit přiřadit hráče (a jeho kurz) k účtu, který vznikne až při
zítřejší registraci. Navíc spočítat headline **kurz na vítěze turnaje** Monte Carlo
simulací a vizualizovat ji.

## Kontext (současný stav)

- `players` jsou **per-turnaj** (každý turnaj = nové řádky), mají `eloRating`
  (default 1500) a volitelný `userId` → účet.
- Kurzy na zápas počítá `src/lib/market.ts` z `winProbability(eloA, eloB)`
  (`src/lib/elo.ts`) → `correctScoreDistribution` / `statOdds` (`src/lib/odds.ts`).
- Po zápase `src/lib/match-lifecycle.ts` volá `updateRatings` a zapíše nové Elo
  na oba hráče — **ale jen v rámci běžícího turnaje**; nový turnaj startuje na 1500.
- `createTournamentWinner` v `market.ts` dnes dává každému hráči **uniformní
  `1/N`** pravděpodobnost (rating ignoruje).
- Enum `market_type` už obsahuje `tournament_winner`, `tournament_runner_up`,
  `tournament_third`; scope `tournament`.

## 1. Datový model

Nová tabulka **`competitors`** = trvalá identita člověka napříč turnaji:

| sloupec | typ | poznámka |
|---|---|---|
| `id` | uuid PK | |
| `displayName` | varchar(80) | |
| `eloRating` | integer, default 1500 | **kanonický** přenášený rating |
| `userId` | uuid, nullable, FK→users (set null), **unique** | účet po registraci |
| `createdAt` | timestamptz | |

Úprava **`players`**: přidat `competitorId uuid` nullable, FK→competitors
(`onDelete: set null`) + index.

**Dva ratingy:**
- `competitor.eloRating` — zdroj pravdy mezi turnaji.
- `player.eloRating` — pracovní rating v turnaji; při založení hráče se **naseedí
  z `competitor.eloRating`**, během turnaje se hýbe jako dnes.

**Writeback:** při přechodu turnaje do `finished` se finální `player.eloRating`
zkopíruje zpět na napojeného competitora (atomicky na konci, ne průběžně).

Migrace: nová Drizzle migrace (tabulka + sloupec + indexy + FK).

## 2. Import historie

Jednorázový **seed skript** `scripts/import-history.ts` (`npm run import-history`),
čte jeden JSON soubor vyplněný z Excelu:

```jsonc
{
  "competitors": ["Honza", "Petr", "Lukáš"],
  "tournaments": [
    {
      "name": "Jablonová Open #1",
      "matches": [
        { "a": "Honza", "b": "Petr", "scoreA": 3, "scoreB": 1 }
      ]
    }
  ]
}
```

Skript:
1. Upsert `competitors` podle jména (každý jednou, start 1500).
2. Pro každý turnaj `tournaments` (status `finished`) + `players` napojené na competitora.
3. Vloží `matches` se skóre a vítězem.
4. **Přehraje Elo** chronologicky (turnaj 1 → 2, v pořadí zápasů) přes `updateRatings`
   (K=32, start 1500). Pro Elo stačí *vítěz zápasu*; skóre se jen ukládá.

Historické turnaje zůstanou v appce viditelné jako archiv (status finished) — záměr.

## 3. Rating a „začátečnické kurzy" nového turnaje

Při zakládání nového turnaje admin u každého hráče určí:
- **Známý** → napojí na existujícího competitora → `player.eloRating` se naseedí
  z `competitor.eloRating`.
- **Nováček** → nový competitor na **1500** → hráč startuje na 1500.

Per-zápasové kurzy se pak dopočítají **stávajícím** kódem (`market.ts`) — žádný nový
odds kód pro zápasy.

Rozhodnutí: nováček = 1500; **žádná regrese** ratingu k průměru (laditelný parametr
do budoucna, teď ne — YAGNI).

## 4. Kurz na vítěze turnaje (Monte Carlo)

Nová čistá funkce `src/lib/tournament-sim.ts` → `simulateTournament(players, cfg, runs=10000)`
(bez DB, testovatelná jako `odds.ts`):

1. Každý běh: rozlosuje skupiny → round-robin zápasy (`winProbability` na leg →
   best-of) → seřadí → postoupí top N (`advancePerGroup`) → pavouk (QF/SF/F,
   příslušné best-of).
2. Zaznamená vítěze, runner-up, third a max. dosaženou fázi.
3. Po N bězích: `probability(hráč) = výhry / N` (analogicky 2./3. místo + dosažení fáze).

Integrace: v `createTournamentWinner` / `createTournamentPlaces` se **nahradí
`1/N`** výstupem simulace; zbytek market-mašinérie (`insertMarket` →
`probabilityToOdds` → blend s parimutuel) zůstává.

Před losem vs. po losu:
- **Rozlosováno** (skupiny/pavouk přiřazené) → simuluje konkrétní rozpis.
- **Před losem** → každý běh náhodné rozlosování, zprůměrováno.

## 5. Vizualizace Monte Carla

**Demo (hotovo):** `docs/monte-carlo-demo.html` — standalone, ukázková data, 4 pohledy.

**Produktová funkce v appce** (admin, příp. read-only sázkaři) — 4 pohledy:
1. Šance na vítězství → kurz (sloupcový graf).
2. Konvergence odhadu (křivka TOP favoritů).
3. Heatmapa šance dojít do fáze.
4. Rozdělení konečného umístění (stacked bar).

Data z `simulateTournament` (rozšířené o per-fázi a per-umístění agregace).
Umístění: stránka/panel u turnaje, ideálně využít existující charting v projektu.

## 6. Propojení účtů a auto-přepočet

**Propojení (model „admin přiřadí"):** admin obrazovka `/admin/competitors` —
tabulka competitorů (jméno, rating, headline kurz) + dropdown s registrovanými
uživateli k napojení. Zápis nastaví `competitor.userId` a `player.userId` v aktivním
turnaji; jde odpojit/přepojit. (Self-claim při registraci = mimo rozsah, případně později.)

**Auto-přepočet (smyčka):**
1. Hook na `status → finished`: writeback `player.eloRating → competitor.eloRating`.
2. Nový turnaj se naseedí z aktualizovaných ratingů (část 3).
3. Po finalizaci rosteru / losu se přepočítá winner/places market (Monte Carlo);
   navíc admin tlačítko „Přepočítat kurzy".

## Dotčené soubory (odhad)

- `src/db/schema.ts` + nová migrace — `competitors`, `players.competitorId`.
- `scripts/import-history.ts` — import + Elo replay.
- `src/lib/tournament-sim.ts` — nová simulace (+ testy).
- `src/lib/market.ts` — winner/places z ratingů místo `1/N`.
- `src/lib/match-lifecycle.ts` nebo `tournament.ts` — writeback na `finished`.
- Admin UI — `/admin/competitors` (párování), tlačítko „Přepočítat kurzy".
- Vizualizační stránka/panel — 4 pohledy.
- Seeding hráčů při zakládání turnaje — výběr/založení competitora.

## Testy

- `tournament-sim` — determinismus se seedovaným RNG, součet pravděpodobností ≈ 1,
  silnější hráč má vyšší šanci, malé turnaje (2–4 hráči) hraniční případy.
- Import/replay — známý vstup → očekávané pořadí ratingů.
- Writeback — po `finished` se competitor rovná finálnímu player Elo.

## Mimo rozsah (YAGNI teď)

- Regrese ratingu k průměru.
- Self-claim identity při registraci.
- Importní UI (stačí seed skript).
- Jiný start nováčků než 1500.
