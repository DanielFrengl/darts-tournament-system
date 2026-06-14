# Manual Elo Override + Competitor Roster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Admin can manually override a competitor's Elo (locked against re-import) and add existing competitors / newcomers to a tournament roster with seeded Elo.

**Architecture:** Add `competitors.eloLocked`; import skips locked rows; admin actions set/unlock Elo and add roster players via existing `competitor.ts` helpers; admin UI exposes both.

**Tech Stack:** Next.js 16, Drizzle (Postgres), Vitest (integration on :5434).

---

## Task 1: `competitors.eloLocked` column

**Files:** Modify `src/db/schema.ts`; generate migration.

- [ ] **Step 1: Add column.** In `competitors` table, after `eloRating`:
```ts
  eloLocked: boolean("elo_locked").notNull().default(false),
```
Ensure `boolean` is imported from `drizzle-orm/pg-core` (it is used elsewhere; add to the import if missing).

- [ ] **Step 2:** `npm run db:generate` — Expected: new migration adding `elo_locked`.
- [ ] **Step 3:** `npm run type-check` — Expected: CLEAN.
- [ ] **Step 4: Commit**
```bash
git add src/db/schema.ts src/db/migrations
git commit -m "feat(db): add competitors.eloLocked"
```

---

## Task 2: Import respects the lock

**Files:** Modify `scripts/import-tournaments.ts` (rating write loop).

- [ ] **Step 1: Skip locked competitors when writing ratings.** Replace the final write loop:
```ts
    for (const name of allNames) {
      await db
        .update(schema.competitors)
        .set({ eloRating: Math.round(finalRatings[name] ?? 1500) })
        .where(eq(schema.competitors.id, compId[name]!));
    }
```
with:
```ts
    for (const name of allNames) {
      const id = compId[name]!;
      const [c] = await db
        .select({ locked: schema.competitors.eloLocked })
        .from(schema.competitors)
        .where(eq(schema.competitors.id, id));
      if (c?.locked) {
        console.log(`• "${name}" je zamčený — rating ponechán`);
        continue;
      }
      await db
        .update(schema.competitors)
        .set({ eloRating: Math.round(finalRatings[name] ?? 1500) })
        .where(eq(schema.competitors.id, id));
    }
```

- [ ] **Step 2: Verify against local test DB.**
```bash
node -e "const p=require('postgres');(async()=>{const c=p('postgres://darts:darts@localhost:5434/darts_test',{max:1});await c\`TRUNCATE competitors,players,matches,tournaments RESTART IDENTITY CASCADE\`;await c.end();})()"
DATABASE_URL="postgres://darts:darts@localhost:5434/darts_test" npm run import-tournaments data/open1.json data/open2.json data/open3.json
# lock Dan, set 1700, re-import, confirm Dan stays 1700:
node -e "const p=require('postgres');(async()=>{const c=p('postgres://darts:darts@localhost:5434/darts_test',{max:1});await c\`UPDATE competitors SET elo_rating=1700, elo_locked=true WHERE display_name='Dan'\`;await c.end();})()"
DATABASE_URL="postgres://darts:darts@localhost:5434/darts_test" npm run import-tournaments data/open1.json data/open2.json data/open3.json
node -e "const p=require('postgres');(async()=>{const c=p('postgres://darts:darts@localhost:5434/darts_test',{max:1});const r=await c\`SELECT display_name,elo_rating,elo_locked FROM competitors WHERE display_name='Dan'\`;console.log(r);await c.end();})()"
```
Expected: Dan stays `elo_rating=1700, elo_locked=true` after re-import.

- [ ] **Step 3: Commit**
```bash
git add scripts/import-tournaments.ts
git commit -m "feat(import): skip locked competitors when writing ratings"
```

---

## Task 3: Admin set/unlock Elo

**Files:** Modify `src/app/admin/competitors/actions.ts`, `CompetitorLinker.tsx`; test `tests/integration/competitor.test.ts`.

- [ ] **Step 1: Failing test** (append in `tests/integration/competitor.test.ts`, import `setCompetitorElo`, `unlockCompetitorElo` from `@/lib/competitor`):
```ts
it("sets and locks elo, then unlocks", async () => {
  const [c] = await testDb.insert(competitors).values({ displayName: "X", eloRating: 1500 }).returning();
  await setCompetitorElo(testDb, c!.id, 1700);
  let [r] = await testDb.select().from(competitors).where(eq(competitors.id, c!.id));
  expect(r!.eloRating).toBe(1700);
  expect(r!.eloLocked).toBe(true);
  await unlockCompetitorElo(testDb, c!.id);
  [r] = await testDb.select().from(competitors).where(eq(competitors.id, c!.id));
  expect(r!.eloLocked).toBe(false);
});
```

- [ ] **Step 2:** `npx vitest run tests/integration/competitor.test.ts -t "sets and locks"` — Expected: FAIL (not defined).

- [ ] **Step 3: Implement helpers** in `src/lib/competitor.ts`:
```ts
export async function setCompetitorElo(db: DB, competitorId: string, elo: number) {
  await db.update(competitors).set({ eloRating: elo, eloLocked: true }).where(eq(competitors.id, competitorId));
}
export async function unlockCompetitorElo(db: DB, competitorId: string) {
  await db.update(competitors).set({ eloLocked: false }).where(eq(competitors.id, competitorId));
}
```

- [ ] **Step 4:** `npx vitest run tests/integration/competitor.test.ts` — Expected: PASS.

- [ ] **Step 5: Server actions** in `src/app/admin/competitors/actions.ts` (mirror existing `ensureAdmin`/`linkAction`):
```ts
import { setCompetitorElo, unlockCompetitorElo } from "@/lib/competitor";

export async function setEloAction(formData: FormData): Promise<Result> {
  if (!(await ensureAdmin())) return { ok: false, error: "Nedostatečná práva" };
  const competitorId = String(formData.get("competitorId") ?? "");
  const elo = Number(formData.get("elo"));
  if (!competitorId || !Number.isFinite(elo) || elo < 0 || elo > 4000)
    return { ok: false, error: "Neplatné Elo" };
  await setCompetitorElo(db, competitorId, Math.round(elo));
  revalidatePath("/admin/competitors");
  return { ok: true };
}

export async function unlockEloAction(formData: FormData): Promise<Result> {
  if (!(await ensureAdmin())) return { ok: false, error: "Nedostatečná práva" };
  const competitorId = String(formData.get("competitorId") ?? "");
  if (!competitorId) return { ok: false, error: "Chybí hráč" };
  await unlockCompetitorElo(db, competitorId);
  revalidatePath("/admin/competitors");
  return { ok: true };
}
```

- [ ] **Step 6: UI.** In `src/app/admin/competitors/page.tsx` select also `eloLocked: competitors.eloLocked`. In `CompetitorLinker.tsx` add `eloLocked` to `CompetitorRow`, and replace the static rating cell with a small `<form action={setEloAction}>` (hidden `competitorId`, `<input name="elo" type="number" defaultValue={c.eloRating}>`, submit „Uložit"); when `c.eloLocked` show a lock marker + a `<form action={unlockEloAction}>` button „Odemknout".

- [ ] **Step 7:** `npm run type-check` && `npm run build` — Expected: CLEAN / compiles.

- [ ] **Step 8: Commit**
```bash
git add src/lib/competitor.ts tests/integration/competitor.test.ts src/app/admin/competitors
git commit -m "feat(admin): manual elo override with lock/unlock"
```

---

## Task 4: Add competitor / newcomer to roster

**Files:** Modify `src/app/admin/tournaments/[id]/players/actions.ts` and `players/page.tsx`.

- [ ] **Step 1: Server actions** in `players/actions.ts` (follow the file's existing `Result` + admin-guard pattern; import `db` from `@/db/client`, helpers from `@/lib/competitor`, `competitors`/`players` from schema):
```ts
import { addPlayerFromCompetitor, addNewcomer } from "@/lib/competitor";

export async function addFromCompetitorAction(tournamentId: string, competitorId: string): Promise<Result> {
  // guard like addPlayer in this file
  await addPlayerFromCompetitor(db, tournamentId, competitorId);
  revalidatePath(`/admin/tournaments/${tournamentId}/players`);
  return { ok: true };
}
export async function addNewcomerAction(tournamentId: string, name: string): Promise<Result> {
  if (!name.trim()) return { ok: false, error: "Jméno je povinné" };
  await addNewcomer(db, tournamentId, name.trim());
  revalidatePath(`/admin/tournaments/${tournamentId}/players`);
  return { ok: true };
}
```
(Check the file's current imports/guard helper and reuse them; do not duplicate `db` import if present.)

- [ ] **Step 2: UI** in `players/page.tsx`: load competitors not already in this tournament:
```ts
const taken = new Set(currentPlayers.map((p) => p.competitorId).filter(Boolean));
const available = (await db.select({ id: competitors.id, name: competitors.displayName, elo: competitors.eloRating })
  .from(competitors)).filter((c) => !taken.has(c.id));
```
Render a `<select>` of `available` (label `${name} (${elo})`) + „Přidat z databáze" calling `addFromCompetitorAction`, and a name input + „Přidat nováčka" calling `addNewcomerAction`. Reuse existing form/styling on the page.

- [ ] **Step 3:** `npm run type-check` && `npm run build` — Expected: CLEAN / compiles.

- [ ] **Step 4: Commit**
```bash
git add src/app/admin/tournaments
git commit -m "feat(roster): add competitor/newcomer to tournament with seeded elo"
```

---

## Final verification
- [ ] `npm test` — all green.
- [ ] `npm run type-check` && `npm run lint` && `npm run build` — clean.
