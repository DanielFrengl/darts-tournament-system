# Tlačítko „Nahlásit chybu" (Discord) — návrh

**Datum:** 2026-06-15
**Stav:** schváleno k naplánování

## Cíl

Přihlášený uživatel může z appky nahlásit chybu; report se odešle na Discord
webhook a obsahuje text, kdo to poslal, na jaké stránce byl a kdy.

## Komponenty

1. **`formatBugReport(opts)`** — čistá funkce (`src/lib/bug-report.ts`), bez IO.
   Vstup: `{ message, user, pageUrl, at }`. Výstup: `string` (Discord `content`).
   Snadno testovatelné (unit).

2. **`reportBugAction(message, pageUrl)`** — server akce (`src/app/actions/report-bug.ts`):
   - `auth()` → musí být přihlášený (jinak `{ ok:false }`); identita (jméno/username)
     se bere ze session, ne z klienta,
   - přečte `process.env.DISCORD_BUG_WEBHOOK_URL` (chybí → `{ ok:false, error }`),
   - `fetch(webhook, { method:"POST", body: { content: formatBugReport(...) } })`,
   - vrátí `{ ok:true }` / `{ ok:false, error }`.

3. **`ReportBugButton`** — klientská komponenta (`src/components/layout/ReportBugButton.tsx`):
   tlačítko „Nahlásit chybu" → malý modal s `textarea` + „Odeslat". Při odeslání
   zavolá `reportBugAction(text, window.location.pathname)`, ukáže úspěch/chybu.

4. **Umístění:** v `SidebarNav` dole (nad „Made by danielfrengl"); renderuje se
   v desktop sidebaru i v mobilním menu (stejná komponenta). Viditelné všem
   přihlášeným.

## Config

- `DISCORD_BUG_WEBHOOK_URL` — env proměnná (Railway + lokální `.env`).
  Bez ní akce vrátí hlášku, tlačítko zůstává.

## Testy

- Unit: `formatBugReport` obsahuje text, jméno, pageUrl, čas; ořízne příliš
  dlouhý text na rozumnou délku.

## Mimo rozsah (YAGNI)

- Ukládání reportů do DB / admin stránka (zvolili jsme „poslat ven").
- Přílohy/screenshoty.
- Rate-limiting (případně později).
