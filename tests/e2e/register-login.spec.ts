import { test, expect } from "@playwright/test";

// Default invite code seeded by app_settings (src/lib/settings.ts DEFAULTS).
const INVITE_CODE = "darts";

test("user can register and reach dashboard", async ({ page }) => {
  const uniqueSuffix = Date.now();
  const email = `e2e-${uniqueSuffix}@test.cz`;

  await page.goto("/register");
  await page.getByLabel("Jméno").fill("Test");
  await page.getByLabel("Příjmení").fill("Uživatel");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Heslo").fill("longenoughpw");
  await page.getByLabel("Zvací kód").fill(INVITE_CODE);
  await page.getByRole("button", { name: /Registrovat/ }).click();

  await expect(page).toHaveURL("/", { timeout: 10_000 });
  await expect(
    page.getByRole("link", { name: "Dashboard" }).first()
  ).toBeVisible({ timeout: 10_000 });
});

test("user can log out and back in", async ({ page }) => {
  const uniqueSuffix = Date.now() + 1;
  const email = `e2e-${uniqueSuffix}@test.cz`;

  await page.goto("/register");
  await page.getByLabel("Jméno").fill("Test");
  await page.getByLabel("Příjmení").fill("Uživatel");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Heslo").fill("longenoughpw");
  await page.getByLabel("Zvací kód").fill(INVITE_CODE);
  await page.getByRole("button", { name: /Registrovat/ }).click();
  await expect(page).toHaveURL("/", { timeout: 10_000 });

  await page.getByLabel("Open user menu").click();
  await page.getByText("Odhlásit").click();
  await expect(page).toHaveURL("/login");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Heslo").fill("longenoughpw");
  await page.getByRole("button", { name: /Přihlásit/ }).click();
  await expect(page).toHaveURL("/", { timeout: 10_000 });
});
