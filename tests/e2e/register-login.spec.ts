import { test, expect } from "@playwright/test";

test("user can register and reach dashboard", async ({ page }) => {
  const uniqueSuffix = Date.now();
  const email = `e2e-${uniqueSuffix}@test.cz`;
  const username = `e2euser${uniqueSuffix}`;

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Heslo").fill("longenoughpw");
  await page.getByRole("button", { name: /Registrovat/ }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByText("Dashboard")).toBeVisible({ timeout: 10_000 });
});

test("user can log out and back in", async ({ page }) => {
  const uniqueSuffix = Date.now() + 1;
  const email = `e2e-${uniqueSuffix}@test.cz`;
  const username = `e2euser${uniqueSuffix}`;

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Heslo").fill("longenoughpw");
  await page.getByRole("button", { name: /Registrovat/ }).click();
  await expect(page).toHaveURL("/");

  await page.getByLabel("Open user menu").click();
  await page.getByText("Odhlásit").click();
  await expect(page).toHaveURL("/login");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Heslo").fill("longenoughpw");
  await page.getByRole("button", { name: /Přihlásit/ }).click();
  await expect(page).toHaveURL("/");
});
