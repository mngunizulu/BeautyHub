import { test, expect } from "@playwright/test";

// Initial-build browser interaction run is intentionally deferred. These are
// runnable smoke tests, not a claim of completed booking/authentication journeys.
test("public discovery filters persist through reload and profile navigation", async ({ page }) => {
  await page.goto("/salons?category=friseur");
  await expect(page.getByTestId("text-result-count")).toHaveText("1 Betrieb gefunden");
  await page.reload();
  await expect(page.getByTestId("chip-category-friseur")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("card-business-atelier-haar").click();
  await expect(page.getByTestId("text-business-name")).toHaveText("Atelier Haar");
  await expect(page.getByTestId("button-book-disabled")).toBeDisabled();
  await expect(page.getByText("Waschen, Schneiden & Föhnen", { exact: true })).toBeVisible();
});

test("search presents a genuine empty state and can reset", async ({ page }) => {
  await page.goto("/salons?q=no-such-demo-studio");
  await expect(page.getByTestId("state-empty")).toBeVisible();
  await page.getByTestId("button-empty-reset").click();
  await expect(page.getByTestId("text-result-count")).toHaveText("3 Betriebe gefunden");
});

test("guest accounts and private routes do not pretend to authenticate", async ({ page, request }) => {
  await page.goto("/anmelden");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  const response = await request.get("/api/admin/workspace");
  expect(response.status()).toBe(401);
});
