import { test, expect } from "@playwright/test";

// Public and managed-auth-entry regressions. Authenticated onboarding is also
// exercised with the managed-Clerk browser test helper; see docs/TEST_REPORT.md.
test("public discovery filters persist through reload and profile navigation", async ({ page }) => {
  await page.goto("/salons?category=friseur");
  await expect(page.getByTestId("card-business-atelier-haar")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.reload();
  await expect(page.getByTestId("chip-category-friseur")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("card-business-atelier-haar").click();
  await expect(page.getByTestId("text-business-name")).toHaveText("Atelier Haar");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expect(page.getByTestId("button-book-disabled")).toBeDisabled();
  await expect(page.getByText("Waschen, Schneiden & Föhnen", { exact: true })).toBeVisible();
});

test("search presents a genuine empty state and can reset", async ({ page }) => {
  await page.goto("/salons?q=no-such-demo-studio");
  await expect(page.getByTestId("state-empty")).toBeVisible();
  await page.getByTestId("button-empty-reset").click();
  await expect(page.getByTestId("card-business-nail-atelier")).toBeVisible();
});

test("guests reach real managed sign-in while private APIs stay protected", async ({ page, request }) => {
  await page.goto("/anmelden");
  await expect(page.getByRole("heading", { name: "Willkommen zurück", exact: true })).toBeVisible();
  await expect(page.locator('input[name="identifier"]')).toBeVisible();
  const response = await request.get("/api/admin/workspace");
  expect(response.status()).toBe(401);
  await page.goto("/konto");
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/sign-up");
  await expect(page.getByRole("heading", { name: "Konto anlegen", exact: true })).toBeVisible();
  await expect(page.locator('input[name="emailAddress"]')).toBeVisible();
});

test("keyboard navigation skips to content and exposes the current page", async ({ page }, testInfo) => {
  await page.goto("/salons");
  const skip = page.getByRole("link", { name: "Zum Inhalt springen" });
  await page.keyboard.press("Tab");
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();

  if (testInfo.project.name === "mobile-chromium") {
    const button = page.getByTestId("button-menu");
    const nav = page.getByRole("navigation", { name: "Mobile Navigation" });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-expanded", "true");
    const current = nav.getByRole("link", { name: "Salons entdecken" });
    await expect(current).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Tab");
    await expect(current).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(nav).toBeHidden();
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute("aria-expanded", "false");
  } else {
    await expect(page.getByRole("navigation", { name: "Hauptnavigation" })
      .getByRole("link", { name: "Salons entdecken" })).toHaveAttribute("aria-current", "page");
  }
});

test("homepage category links open filtered salon results", async ({ page }) => {
  await page.goto("/");
  const categories = page.getByRole("region", { name: "Nach Kategorie entdecken" });
  await expect(categories.getByRole("link")).toHaveCount(10);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await categories.getByRole("link", { name: "Friseure" }).click();
  await expect(page).toHaveURL(/\/salons\?category=friseur$/);
  await expect(page.getByTestId("chip-category-friseur")).toHaveAttribute("aria-pressed", "true");
});
