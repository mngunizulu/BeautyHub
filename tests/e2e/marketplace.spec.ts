import { devices, expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

const ownerState = process.env.BEAUTYHUB_E2E_OWNER_STATE;
const customerState = process.env.BEAUTYHUB_E2E_CUSTOMER_STATE;
const organizationId = process.env.BEAUTYHUB_E2E_ORGANIZATION_ID;
const salonSlug = process.env.BEAUTYHUB_E2E_SALON_SLUG;

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=",
  "base64",
);

test("owner uploads a public photo and customer saves and removes the salon", async ({ browser, baseURL }, testInfo) => {
  test.skip(!ownerState || !customerState || !organizationId || !salonSlug,
    "Set the two Clerk storage states, test organization ID, and published salon slug.");
  const { defaultBrowserType: _browserType, ...device } = devices[
    testInfo.project.name === "mobile-chromium" ? "Pixel 7" : "Desktop Chrome"
  ];
  const owner = await browser.newContext({ ...device, baseURL, storageState: ownerState });
  const customer = await browser.newContext({ ...device, baseURL, storageState: customerState });
  const alt = `Foto für Browserprüfung ${randomUUID()}`;
  let uploadedUrl: string | undefined;
  let favoritePath: string | undefined;
  let savedByTest = false;

  try {
    const profile = await owner.request.get(`/api/businesses/${salonSlug}`);
    expect(profile.ok()).toBeTruthy();
    const { id: locationId, name } = await profile.json();
    const galleryPath = `/api/organizations/${organizationId}/locations/${locationId}/gallery`;
    favoritePath = `/api/me/favorites/${locationId}`;

    const ownerPage = await owner.newPage();
    await ownerPage.goto(`/unternehmen/${organizationId}?bereich=standorte`);
    await expect(ownerPage.getByRole("heading", { name: "Galerie" })).toBeVisible();
    expect(await ownerPage.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(ownerPage.viewportSize()!.width);
    await ownerPage.locator("#gallery-location").selectOption(locationId);
    await ownerPage.getByLabel("Foto", { exact: true }).setInputFiles({ name: "browser-test.png", mimeType: "image/png", buffer: pixel });
    await ownerPage.getByLabel("Bildbeschreibung").fill(alt);
    const [upload] = await Promise.all([
      ownerPage.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === galleryPath),
      ownerPage.getByRole("button", { name: "Foto hochladen" }).click(),
    ]);
    expect(upload.status()).toBe(201);
    uploadedUrl = `${galleryPath}/${(await upload.json()).id}`;
    await expect(ownerPage.getByRole("img", { name: alt })).toBeVisible();

    const customerPage = await customer.newPage();
    await customerPage.goto(`/salons/${salonSlug}`);
    const photo = customerPage.getByRole("img", { name: alt });
    await photo.scrollIntoViewIfNeeded();
    await expect(photo).toBeVisible();
    await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1);
    const add = customerPage.getByRole("button", { name: "Salon merken" });
    await expect(add).toBeEnabled();
    savedByTest = true;
    await add.click();
    await expect(customerPage.getByRole("button", { name: "Gemerkt" })).toHaveAttribute("aria-pressed", "true");

    await customerPage.goto("/konto");
    await expect(customerPage.getByRole("heading", { name: "Favoriten" })).toBeVisible();
    await expect(customerPage.locator(`a[href="/salons/${salonSlug}"]`)).toBeVisible();
    const remove = customerPage.getByRole("button", { name: `${name} aus Favoriten entfernen`, exact: true });
    await remove.click();
    await expect(remove).toHaveCount(0);
  } finally {
    try {
      if (savedByTest && favoritePath) expect((await customer.request.delete(favoritePath)).status()).toBe(204);
      if (uploadedUrl) expect((await owner.request.delete(uploadedUrl)).status()).toBe(204);
    } finally {
      await Promise.all([customer.close(), owner.close()]);
    }
  }
});

test("a business can choose multiple marketplace categories during registration", async ({ browser, baseURL }, testInfo) => {
  test.skip(!ownerState, "Set the Clerk development owner session.");
  const { defaultBrowserType: _browserType, ...device } = devices[
    testInfo.project.name === "mobile-chromium" ? "Pixel 7" : "Desktop Chrome"
  ];
  const owner = await browser.newContext({ ...device, baseURL, storageState: ownerState });
  try {
    const page = await owner.newPage();
    await page.goto("/unternehmen?neu");
    const picker = page.getByRole("group", { name: "Kategorien" });
    await expect(picker.getByRole("checkbox")).toHaveCount(10);
    await page.getByTestId("input-organization-name").fill("Kategorie QA " + randomUUID().slice(0, 8));
    await picker.getByRole("checkbox", { name: "Friseure", exact: true }).check();
    await picker.getByRole("checkbox", { name: "Haarentfernung", exact: true }).check();
    const [created] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/organizations"),
      page.getByTestId("button-create-organization").click(),
    ]);
    expect(created.status()).toBe(201);
    const business = await created.json();
    expect(business.profile.categoryIds).toHaveLength(2);
    await expect(page).toHaveURL(new RegExp("/unternehmen/" + business.id));
    const saved = page.getByRole("group", { name: "Kategorien" });
    await expect(saved.getByRole("checkbox", { name: /Friseure.*Hauptkategorie/ })).toBeChecked();
    await expect(saved.getByRole("checkbox", { name: "Haarentfernung", exact: true })).toBeChecked();
  } finally {
    await owner.close();
  }
});
