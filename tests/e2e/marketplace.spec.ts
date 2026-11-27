import { readFile } from "node:fs/promises";
import { devices, expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

const ownerState = process.env.BEAUTYHUB_E2E_OWNER_STATE;
const customerState = process.env.BEAUTYHUB_E2E_CUSTOMER_STATE;
const organizationId = process.env.BEAUTYHUB_E2E_ORGANIZATION_ID;
const salonSlug = process.env.BEAUTYHUB_E2E_SALON_SLUG;

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
  let productPath: string | undefined;
  const productData = { sku: "PHOTO-" + randomUUID().slice(0, 8).toUpperCase(), name: "Gallery QA product",
    category: "", supplier: "", imageUrl: "", unitCents: 500, reorderAt: 0 };

  try {
    const profile = await owner.request.get(`/api/businesses/${salonSlug}`);
    expect(profile.ok()).toBeTruthy();
    const { id: locationId, name, services } = await profile.json();
    const galleryPath = `/api/organizations/${organizationId}/locations/${locationId}/gallery`;
    favoritePath = `/api/me/favorites/${locationId}`;
    const inventory = `/api/organizations/${organizationId}/locations/${locationId}/inventory`;
    const product = await owner.request.post(inventory, { data: productData });
    expect(product.status()).toBe(201);
    productPath = inventory + "/" + (await product.json()).id;

    const ownerPage = await owner.newPage();
    ownerPage.setDefaultTimeout(8000);
    await ownerPage.goto(`/unternehmen/${organizationId}`);
    await ownerPage.getByTestId("nav-section-galerie").click();
    await expect(ownerPage.getByRole("heading", { name: "Galerie" })).toBeVisible();
    expect(await ownerPage.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(ownerPage.viewportSize()!.width);
    await ownerPage.locator("#gallery-location").selectOption(locationId);
    await ownerPage.getByLabel("Foto", { exact: true }).setInputFiles({ name: "browser-test.png", mimeType: "image/png", buffer: await readFile("tests/fixtures/gallery-photo.png") });
    await ownerPage.getByLabel("Bildbeschreibung").fill(alt);
    const [upload] = await Promise.all([
      ownerPage.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === galleryPath),
      ownerPage.getByRole("button", { name: "Foto hochladen" }).click(),
    ]);
    expect(upload.status()).toBe(201);
    const { id: photoId } = await upload.json();
    uploadedUrl = `${galleryPath}/${photoId}`;
    await expect(ownerPage.getByRole("img", { name: alt })).toBeVisible();

    const section = ownerPage.getByRole("region", { name: "Bilder zuordnen" });
    await section.getByLabel("Titelbild für Profil und Vorschau").selectOption(photoId);
    await expect(section.getByLabel("Titelbild für Profil und Vorschau")).toHaveValue(photoId);
    await section.getByText("Leistungsbilder", { exact: true }).click();
    await section.getByRole("combobox", { name: services[0].name, exact: true }).selectOption(photoId);
    await expect(section.getByRole("combobox", { name: services[0].name, exact: true })).toHaveValue(photoId);
    await section.getByText("Produktbilder im Lager", { exact: true }).click();
    const productPicker = section.getByRole("combobox", { name: productData.name + " · " + productData.sku, exact: true });
    await productPicker.selectOption(photoId);
    await expect(productPicker).toHaveValue(photoId);
    await ownerPage.getByTestId("nav-section-lager").click();
    await expect(ownerPage.locator(`img[src="${uploadedUrl}"]`)).toBeVisible();

    const customerPage = await customer.newPage();
    customerPage.setDefaultTimeout(8000);
    await customerPage.goto(`/salons/${salonSlug}`);
    const publicImage = `/api/gallery/${photoId}`;
    await expect(customerPage.getByTestId("row-service-" + services[0].id).getByRole("img", { name: alt })).toHaveAttribute("src", publicImage);
    const photo = customerPage.getByRole("region", { name: "Galerie" }).getByRole("img", { name: alt, exact: true });
    await photo.scrollIntoViewIfNeeded();
    await expect(photo).toBeVisible();
    await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1280);
    await expect(customerPage.locator("main > div > section").first().getByRole("img", { name: alt, exact: true })).toHaveAttribute("src", publicImage);
    await customerPage.goto("/salons");
    await expect(customerPage.getByTestId("card-business-" + salonSlug).getByRole("img", { name: alt })).toHaveAttribute("src", publicImage);
    await customerPage.goto(`/salons/${salonSlug}`);
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
      if (productPath) expect((await owner.request.put(productPath, { data: { ...productData, archived: true } })).status()).toBe(200);
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

test("a business can create a service group inline and assign staff and a variant", async ({ browser, baseURL }, testInfo) => {
  test.skip(!ownerState || !organizationId, "Set the Clerk development owner session and organization.");
  const { defaultBrowserType: _browserType, ...device } = devices[
    testInfo.project.name === "mobile-chromium" ? "Pixel 7" : "Desktop Chrome"
  ];
  const owner = await browser.newContext({ ...device, baseURL, storageState: ownerState });
  try {
    const page = await owner.newPage();
    await page.goto(`/unternehmen/${organizationId}?bereich=leistungen`);
    await page.getByTestId("button-add-service").click();
    const form = page.getByTestId("form-service-new");
    const groups = form.getByRole("group", { name: "Leistungsgruppe (optional)" });
    await expect(groups.getByText(/Du hast noch keine Gruppen/)).toBeVisible();
    await groups.getByLabel("Name der neuen Gruppe").fill("Massagen");
    await groups.getByRole("button", { name: "Gruppe anlegen" }).click();
    await expect(groups.getByRole("option", { name: "Massagen" })).toHaveJSProperty("selected", true);
    const serviceName = "Massage QA " + randomUUID().slice(0, 8);
    await form.getByLabel("Name der Leistung").fill(serviceName);
    await form.getByLabel("Preis (Euro)").fill("45");
    await form.getByRole("group", { name: "Mitarbeitende für diese Leistung" }).getByRole("button", { name: "Test Staff" }).click();
    const variants = form.getByRole("group", { name: "Leistungsvarianten (optional)" });
    await variants.getByRole("button", { name: "Variante hinzufügen" }).click();
    await variants.getByLabel("Variante 1 Name").fill("60 Minuten");
    await variants.getByLabel("Variante 1 Dauer").fill("60");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    await form.getByTestId("button-save-service").click();
    const row = page.getByRole("listitem").filter({ hasText: serviceName });
    await expect(row).toContainText("Test Staff");
    await expect(row).toContainText("60 Minuten");
    await expect(page.getByText("Massagen", { exact: true })).toBeVisible();
  } finally {
    await owner.close();
  }
});
