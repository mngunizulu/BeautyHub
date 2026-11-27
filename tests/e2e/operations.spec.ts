import { devices, expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

const ownerState = process.env.BEAUTYHUB_E2E_OWNER_STATE;
const organizationId = process.env.BEAUTYHUB_E2E_ORGANIZATION_ID;
const day = process.env.BEAUTYHUB_E2E_BOOKING_DATE;

test("business can move an appointment, add a staff break and link private CRM history", async ({ browser, baseURL }, testInfo) => {
  test.skip(!ownerState || !organizationId || !day, "Set the Clerk owner state, organization ID, and an available Monday.");
  const mobile = testInfo.project.name === "mobile-chromium";
  const { defaultBrowserType: _browserType, ...device } = devices[mobile ? "Pixel 7" : "Desktop Chrome"];
  const owner = await browser.newContext({ ...device, baseURL, storageState: ownerState });
  const guest = "Operations QA " + randomUUID().slice(0, 8);
  let bookingId: string | undefined;
  const calendar = `/api/organizations/${organizationId}/booking-calendar`;
  try {
    const page = await owner.newPage();
    await page.goto(`/unternehmen/${organizationId}?bereich=kalender`);
    await page.getByRole("button", { name: "Neuer Termin", exact: true }).click();
    await page.locator("#manual-date").fill(day!);
    await page.getByLabel("Name des Gasts").fill(guest);
    await page.getByRole("checkbox", { name: "QA Treatment", exact: true }).check();
    await page.getByRole("button", { name: "Freie Zeiten suchen", exact: true }).click();
    const free = page.getByLabel("Freie Zeiten", { exact: true });
    const first = free.locator("option").nth(1);
    await expect(first).toBeAttached();
    await free.selectOption((await first.getAttribute("value"))!);
    const [created] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === calendar),
      page.getByRole("button", { name: "Termin speichern", exact: true }).click(),
    ]);
    expect(created.status()).toBe(201);
    const booking = await created.json();
    bookingId = booking.id;
    const row = page.getByRole("listitem").filter({ hasText: guest });
    await expect(row).toBeVisible();
    if (mobile) {
      await row.getByRole("button", { name: "Verschieben" }).click();
    } else {
      const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
      await row.dispatchEvent("dragstart", { dataTransfer });
      await page.locator('[aria-label="Termindatum für Verschiebung"]').getByText(day!, { exact: true }).dispatchEvent("drop", { dataTransfer });
      await dataTransfer.dispose();
    }
    const editor = page.getByRole("region", { name: /Termin verschieben/ });
    await editor.getByRole("button", { name: "Freie Zeiten suchen" }).click();
    const slots = editor.getByLabel("Neue Zeit");
    const second = slots.locator("option").nth(2);
    await expect(second).toBeAttached();
    await slots.selectOption((await second.getAttribute("value"))!);
    const [changed] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/reschedule")),
      editor.getByRole("button", { name: "Verschiebung speichern" }).click(),
    ]);
    expect(changed.status()).toBe(200);
    expect((await changed.json()).startsAt).not.toBe(booking.startsAt);

    await page.getByTestId("nav-section-team").click();
    await expect(page.getByRole("heading", { name: "Regelmäßige Pausen" })).toBeVisible();
    const breaks = page.locator("section").filter({ has: page.getByRole("heading", { name: "Regelmäßige Pausen", exact: true }) });
    await breaks.getByLabel("Beginn", { exact: true }).fill(mobile ? "14:30" : "14:00");
    await breaks.getByLabel("Ende", { exact: true }).fill(mobile ? "14:45" : "14:15");
    await breaks.getByRole("button", { name: "Pause hinzufügen" }).click();
    const interval = mobile ? "14:30–14:45" : "14:00–14:15";
    await expect(breaks.getByText("Montag · " + interval, { exact: false })).toBeVisible();
    if (process.env.BEAUTYHUB_E2E_STAFF_BREAKS === "1") {
      await expect(breaks.getByText("Dienstag · " + interval, { exact: false })).toBeVisible();
      const slug = process.env.BEAUTYHUB_E2E_SALON_SLUG;
      const publicPath = "/api/businesses/" + slug;
      const before = await owner.request.get(publicPath);
      expect(before.status()).toBe(200);
      const business = await before.json();
      expect(business.staff).toEqual([]);
      const serviceId = business.services.find((service: { name: string }) => service.name === "QA Treatment").id;
      const available = () => owner.request.post(publicPath + "/availability", { data: { date: day, items: [{ serviceId }] } });
      expect((await (await available()).json()).slots).toContainEqual(expect.objectContaining({ employeeName: "Teammitglied" }));
      const staffRow = page.getByRole("listitem").filter({ hasText: "Test Staff" });
      await staffRow.getByRole("button", { name: "Bearbeiten" }).click();
      const name = page.getByLabel("Öffentlicher Anzeigename (optional)");
      await expect(name).toHaveValue("");
      await page.getByRole("button", { name: "Internen Namen als öffentlichen Namen übernehmen" }).click();
      await expect(name).toHaveValue("Test Staff");
      await page.getByTestId("button-save-employee").click();
      await expect(page.getByTestId("button-save-employee")).toHaveCount(0);
      const profile = await owner.request.get(publicPath);
      expect((await profile.json()).staff).toContainEqual(expect.objectContaining({ name: "Test Staff" }));
      expect((await (await available()).json()).slots).toContainEqual(expect.objectContaining({ employeeName: "Test Staff" }));
    }

    await page.getByTestId("nav-section-kunden").click();
    await page.getByRole("button", { name: "Kundenprofil anlegen" }).click();
    await page.locator("#crm-name").fill(guest);
    await page.getByLabel("Private Notizen und Wünsche").fill("Private CRM test note");
    await page.getByRole("button", { name: "Kundenprofil speichern" }).click();
    await expect(page.getByRole("heading", { name: `Kundenprofil · ${guest}` })).toBeVisible();
    await page.getByLabel("Vorhandenen Termin zuordnen").selectOption(bookingId!);
    await page.getByRole("button", { name: "Termin zuordnen" }).click();
    await expect(page.getByRole("button", { name: "Zuordnung lösen" })).toBeVisible();
    await page.locator("#crm-file").setInputFiles({
      name: "qa.pdf", mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n"),
    });
    await page.getByRole("button", { name: "Dokument hochladen" }).click();
    await expect(page.getByRole("button", { name: "qa.pdf", exact: true })).toBeVisible();
  } finally {
    try {
      if (bookingId) await owner.request.post(`${calendar}/${bookingId}/status`, { data: { status: "cancelled" } });
    } finally {
      await owner.close();
    }
  }
});
