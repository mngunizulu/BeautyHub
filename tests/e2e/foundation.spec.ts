import { test, expect } from "@playwright/test";

// Public and managed-auth-entry regressions. Authenticated onboarding is also
// exercised with the managed-Clerk browser test helper; see docs/TEST_REPORT.md.
test("public discovery filters persist through reload and profile navigation", async ({ page }) => {
  await page.goto("/salons?category=friseur");
  await expect(page.getByTestId("card-business-atelier-haar")).toBeVisible();
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
  await expect(page.getByTestId("card-business-nail-atelier")).toBeVisible();
});

test("guests reach real managed sign-in while private APIs stay protected", async ({ page, request }) => {
  await page.goto("/anmelden");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator('input[name="identifier"]')).toBeVisible();
  const response = await request.get("/api/admin/workspace");
  expect(response.status()).toBe(401);
  await page.goto("/konto");
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/sign-up");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator('input[name="emailAddress"]')).toBeVisible();
});
