import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Fixture = {
  tournamentId: string;
  matchId: string;
  bettor: { email: string; password: string };
  admin: { email: string; password: string };
};

const fixture: Fixture = JSON.parse(
  readFileSync(join(process.cwd(), "tests/e2e/.fixture.json"), "utf8")
);

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Heslo").fill(password);
  await page.getByRole("button", { name: /Přihlásit/ }).click();
  await expect(page).toHaveURL("/", { timeout: 10_000 });
}

test("live betting: place bet, admin scores match, bettor gets win notification", async ({
  browser,
}) => {
  // --- Bettor places a bet on Alice (match_winner) ---
  const bettorCtx = await browser.newContext();
  const bettor = await bettorCtx.newPage();
  await login(bettor, fixture.bettor.email, fixture.bettor.password);

  await bettor.goto(`/match/${fixture.matchId}`);
  await bettor.getByRole("button", { name: /Alice/ }).first().click();
  await bettor.getByLabel("Vklad").fill("100");
  await bettor.getByRole("button", { name: "Vsadit" }).click();
  await expect(bettor.getByText(/Sázka přijata/)).toBeVisible({ timeout: 10_000 });

  // Park the bettor on the dashboard so UserLiveSync stays subscribed to the
  // personal channel and can receive the bet-settlement event.
  await bettor.goto("/");
  await expect(bettor).toHaveURL("/");

  // --- Admin (debug) scores the best-of-1 match: Alice wins ---
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await login(admin, fixture.admin.email, fixture.admin.password);

  await admin.goto(`/admin/tournaments/${fixture.tournamentId}/play`);
  await admin.getByRole("button", { name: /Spustit zápas/ }).first().click();
  // Winner buttons appear once the leg is live.
  const aliceWinner = admin.getByRole("button", { name: "Alice" }).first();
  await expect(aliceWinner).toBeVisible({ timeout: 10_000 });
  await aliceWinner.click();

  // --- Bettor receives the live "bet won" toast without navigating ---
  await expect(bettor.getByText(/Sázka vyhrála/)).toBeVisible({ timeout: 15_000 });

  await bettorCtx.close();
  await adminCtx.close();
});
