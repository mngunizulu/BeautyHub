import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { devices, expect, test } from "@playwright/test";

const ownerState = process.env.BEAUTYHUB_E2E_OWNER_STATE;
const customerState = process.env.BEAUTYHUB_E2E_CUSTOMER_STATE;
const organizationId = process.env.BEAUTYHUB_E2E_ORGANIZATION_ID;
const slug = process.env.BEAUTYHUB_E2E_SALON_SLUG;
const day = process.env.BEAUTYHUB_E2E_BOOKING_DATE;

test("customer books and reschedules multiple services and the business calendar reflects cancellation", async ({ browser, baseURL }, testInfo) => {
  if (process.env.BEAUTYHUB_E2E_REVIEW_FLOW === "1") test.setTimeout(60_000);
  test.skip(!ownerState || !customerState || !organizationId || !slug || !day, "Set Clerk test sessions and the bookable salon fixture.");
  const { defaultBrowserType: _browserType, ...device } = devices[testInfo.project.name === "mobile-chromium" ? "Pixel 7" : "Desktop Chrome"];
  const customer = await browser.newContext({ ...device, baseURL, storageState: customerState });
  const owner = await browser.newContext({ ...device, baseURL, storageState: ownerState });
  let bookingId: string | undefined;
  try {
    const page = await customer.newPage();
    const staged = process.env.BEAUTYHUB_E2E_STAGE_55 === "1";
    const homeSlots = process.env.BEAUTYHUB_E2E_HOME_SLOTS === "1";
    const refundCase = process.env.BEAUTYHUB_E2E_APPOINTMENT_REFUNDS === "1";
    const refundNote = "Refund case " + testInfo.project.name;
    await page.goto(`/salons?date=${day}&service=QA%20Treatment${staged ? "&city=Essen" : ""}`);
    await page.getByTestId(`card-business-${slug}`).click();
    const bookingLink = page.getByRole("link", { name: "Termin buchen", exact: true });
    await bookingLink.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#salon-booking")).toBeFocused();
    if (staged) {
      await expect(page.getByRole("link", { name: "Auf der Karte ansehen" })).toHaveAttribute("href", /openstreetmap.*Essen/);
      await expect(page.getByRole("heading", { name: "Öffnungszeiten" })).toBeVisible();
      await expect(page.getByText("Noch keine veröffentlichten Bewertungen.")).toBeVisible();
      await expect(page.getByText("QA Hair Services", { exact: true })).toBeVisible();
      await page.getByRole("checkbox", { name: "QA Hair Wash", exact: true }).check();
      await page.getByLabel("Wunschtermin").fill("");
      await page.getByRole("checkbox", { name: "QA Colour", exact: true }).check();
      await expect(page.getByLabel("Wunschtermin")).toHaveValue("");
      const variant = page.locator("select").filter({ has: page.locator("option").filter({ hasText: "QA Colour Plus" }) });
      await variant.selectOption((await variant.locator("option").filter({ hasText: "QA Colour Plus" }).getAttribute("value"))!);
    }
    await page.getByRole("checkbox", { name: "QA Treatment", exact: true }).check();
    await page.getByRole("checkbox", { name: "QA Add-on", exact: true }).check();
    if (staged) {
      const calendar = page.getByLabel("Kalender verfügbarer Tage");
      const label = new Intl.DateTimeFormat("de-DE", { dateStyle: "full", timeZone: "UTC" })
        .format(new Date(day!));
      const target = calendar.getByRole("button", { name: label, exact: true });
      for (let week = 0; week < 3; week++) {
        await expect(calendar.getByRole("button").nth(2)).toBeAttached();
        if (await target.count()) break;
        await calendar.getByRole("button", { name: "Nächste Woche" }).click();
      }
      await expect(calendar.getByRole("status")).toContainText("Verfügbare Tage wurden geladen.");
      await target.focus();
      await page.keyboard.press("Enter");
      await expect(target).toHaveAttribute("aria-pressed", "true");
      await expect(target).toBeFocused();
      await expect(page.getByRole("status").filter({ hasText: "Termine gefunden." })).toBeAttached();
    } else {
      await page.locator("#booking-date").fill(day!);
    }
    await expect(page.getByText(staged ? /Standardpreis.*90,00\s*€/ : /70,00\s*€/)).toBeVisible();
    await expect(page.getByLabel("Verfügbare Termine").locator("option").nth(1)).toBeAttached();
    if (homeSlots) {
      const settings = await owner.newPage();
      await settings.goto(`/unternehmen/${organizationId}?bereich=buchung`);
      const release = settings.getByRole("region", { name: "Online-Termine freigeben" });
      await release.getByLabel("Leistung", { exact: true }).selectOption({ label: "QA Treatment" });
      await release.getByLabel("Datum für Online-Termine").fill(day!);
      const customerSlots = page.getByLabel("Verfügbare Termine");
      const first = (await customerSlots.locator("option").nth(1).getAttribute("value"))!;
      const startsAt = first.split("/")[1]!;
      const checkbox = release.getByRole("checkbox", { name: new RegExp(startsAt.slice(11, 16) + " UTC") });
      const update = async (enabled: boolean) => {
        const [response] = await Promise.all([
          settings.waitForResponse((reply) => reply.request().method() === "PUT" && new URL(reply.url()).pathname.endsWith("/online-slots")),
          checkbox.click(),
        ]);
        expect(response.status()).toBe(204);
        await expect(checkbox).toBeEnabled();
        await expect(checkbox).toBeChecked({ checked: enabled });
      };
      await update(false);
      await page.getByRole("button", { name: "Verfügbarkeit prüfen" }).click();
      await expect(customerSlots.locator("option").nth(1)).toBeAttached();
      await expect(customerSlots.locator(`option[value="${first}"]`)).toHaveCount(0);
      await update(true);
      await page.getByRole("button", { name: "Verfügbarkeit prüfen" }).click();
      await expect(customerSlots.locator(`option[value="${first}"]`)).toHaveCount(1);
      await settings.close();
    }
    const differential = process.env.BEAUTYHUB_E2E_PROFESSIONAL_PRICING === "1";
    const mixed = process.env.BEAUTYHUB_E2E_MIXED_PROFESSIONALS === "1";
    if (differential && !mixed) await page.getByLabel("Fachkraft", { exact: true }).selectOption({ label: "Test Staff · Senior QA" });
    const slot = page.getByLabel("Verfügbare Termine");
    await expect(slot.locator("option").nth(2)).toBeAttached();
    const first = (await slot.locator("option").nth(1).getAttribute("value"))!;
    await slot.selectOption(first);
    if (differential) {
      await expect(page.getByText(staged ? /Endbetrag.*97,00\s*€/ : /Endbetrag.*77,00\s*€/)).toBeVisible();
      await expect(page.getByText(/QA Treatment · Test Staff/)).toBeVisible();
    }
    if (mixed) await expect(page.getByText(/QA Add-on .* Second Staff/)).toBeVisible();
    const setupPayment = page.getByRole("button", { name: "Simulierte Zahlungsmethode hinterlegen" });
    if (await setupPayment.isVisible()) await setupPayment.click();
    await expect(page.getByText("Simulierte Zahlungsmethode hinterlegt. Keine Abbuchung.", { exact: true })).toBeVisible();
    if (staged || refundCase) await page.getByLabel("Hinweis zum Termin (optional)").fill(refundCase ? refundNote : "Test note for BeautyHub");
    await page.getByRole("checkbox", { name: /Ich akzeptiere die Stornierungsbedingungen/ }).check();
    const [created] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/bookings")),
      page.getByRole("button", { name: "Termin bestätigen" }).click(),
    ]);
    expect(created.status()).toBe(201);
    const booking = await created.json();
    bookingId = booking.id;
    expect(booking.items).toHaveLength(staged ? 4 : 2);
    if (staged || refundCase) expect(booking.appointmentNote).toBe(refundCase ? refundNote : "Test note for BeautyHub");
    if (mixed) expect(booking.items[0].employeeId).not.toBe(booking.items[1].employeeId);
    await expect(page.getByText("Termin bestätigt.", { exact: false })).toBeVisible();

    const calendar = await owner.newPage();
    await calendar.goto(`/unternehmen/${organizationId}?bereich=kalender`);
    await calendar.locator("#calendar-date").fill(day!);
    if (process.env.BEAUTYHUB_E2E_INVENTORY === "1") {
      const inventory = await owner.newPage();
      await inventory.goto(`/unternehmen/${organizationId}?bereich=lager`);
      await inventory.getByRole("button", { name: "Artikel anlegen" }).click();
      const sku = "QA-" + testInfo.project.name.toUpperCase();
      await inventory.getByLabel("Artikelnummer").fill(sku);
      await inventory.getByLabel("Name", { exact: true }).fill("QA Shampoo");
      await inventory.getByLabel("Stückpreis (EUR)").fill("12,50");
      await inventory.getByLabel("Meldebestand").fill("3");
      if (process.env.BEAUTYHUB_E2E_INVENTORY_REPORT === "1") await inventory.getByLabel("Einkaufspreis (EUR, optional)").fill("4,50");
      await inventory.getByRole("button", { name: "Artikel speichern" }).click();
      const product = inventory.getByRole("listitem").filter({ hasText: sku });
      await expect(product.getByText(/Bestand 0.*Niedriger Bestand/)).toBeVisible();
      await product.getByText("Lagerbewegungen", { exact: true }).click();
      await product.getByLabel("Menge", { exact: true }).fill("5");
      await product.getByLabel("Grund oder Referenz").fill("QA delivery");
      await product.getByRole("button", { name: "Bewegung buchen" }).click();
      await expect(product.getByText(/Wareneingang.*Bestand 5.*QA delivery/)).toBeVisible();
      await expect(product.getByText(/Niedriger Bestand/)).toHaveCount(0);
      if (process.env.BEAUTYHUB_E2E_INVENTORY_REPORT === "1") {
        const report = inventory.getByRole("region", { name: "Bestandsbericht" });
        const expected = testInfo.project.name === "mobile-chromium" ? "45,00 EUR" : "22,50 EUR";
        await expect(report.getByText(expected, { exact: true })).toBeVisible();
      }
      if (process.env.BEAUTYHUB_E2E_PURCHASING === "1") {
        await inventory.getByText("Lieferanten und Bestellungen", { exact: true }).click();
        await inventory.getByLabel("Lieferantenname").fill("QA Supplier " + testInfo.project.name);
        await inventory.getByLabel("E-Mail des Lieferanten").fill("orders@example.com");
        await inventory.getByRole("button", { name: "Lieferant anlegen" }).click();
        await inventory.getByLabel("Bestellartikel", { exact: true }).selectOption({ label: "QA Shampoo · " + sku });
        await inventory.getByLabel("Bestellmenge").fill("3");
        await inventory.getByRole("button", { name: "Bestellung anlegen" }).click();
        if (process.env.BEAUTYHUB_E2E_PARTIAL_RECEIPT === "1") {
          await inventory.getByText("Teillieferung erfassen", { exact: true }).click();
          await inventory.getByLabel(/QA Shampoo.*offen 3/).fill("1");
          await inventory.getByRole("button", { name: "Teillieferung buchen" }).click();
          await expect(inventory.getByText(/Eingegangen 1 \/ 3/)).toBeVisible();
          await expect(product.getByText(/Wareneingang.*Bestand 6.*Bestellung/)).toBeVisible();
        }
        await inventory.getByRole("button", { name: /Wareneingang buchen/ }).click();
        await expect(inventory.locator("p").filter({ hasText: new RegExp("^QA Supplier " + testInfo.project.name + " .* Eingegangen") })).toBeVisible();
        await expect(product.getByText(/Wareneingang.*Bestand 8.*Bestellung/)).toBeVisible();
      }
    }
    if (process.env.BEAUTYHUB_E2E_MARKETING === "1") {
      const marketing = await owner.newPage();
      await marketing.goto(`/unternehmen/${organizationId}?bereich=marketing`);
      const title = "QA Draft " + testInfo.project.name;
      await marketing.getByLabel("Interner Titel").fill(title);
      await marketing.getByLabel("Betreff").fill("Studio update");
      await marketing.getByLabel("Nachricht").fill("An example campaign draft.");
      await marketing.getByLabel("Zielgruppe").selectOption("repeat");
      await expect(marketing.getByText("0 Kontakte mit Einwilligung")).toBeVisible();
      await marketing.getByRole("button", { name: "Entwurf speichern" }).click();
      await expect(marketing.getByText("Entwurf gespeichert.")).toBeVisible();
      await marketing.reload();
      await marketing.getByRole("button", { name: title }).click();
      await expect(marketing.getByLabel("Betreff")).toHaveValue("Studio update");
      if (process.env.BEAUTYHUB_E2E_MARKETING_TEMPLATES === "1") {
        await marketing.getByRole("button", { name: "Als Vorlage speichern" }).click();
        await expect(marketing.getByText("Vorlage gespeichert.")).toBeVisible();
        await marketing.reload();
        await marketing.getByLabel("Kampagnenvorlage").selectOption({ label: title });
        await expect(marketing.getByLabel("Betreff")).toHaveValue("Studio update");
        await marketing.getByLabel("Betreff").fill("Template revision");
        await marketing.getByRole("button", { name: "Vorlage aktualisieren" }).click();
        await expect(marketing.getByText("Vorlage gespeichert.")).toBeVisible();
        const reused = title + " reused";
        await marketing.getByLabel("Interner Titel").fill(reused);
        await marketing.getByRole("button", { name: "Entwurf speichern" }).click();
        await expect(marketing.getByText("Entwurf gespeichert.")).toBeVisible();
        await expect(marketing.getByRole("button", { name: reused, exact: true })).toBeVisible();
        await marketing.getByRole("button", { name: title, exact: true }).click();
        await expect(marketing.getByLabel("Betreff")).toHaveValue("Studio update");
      }
      if (process.env.BEAUTYHUB_E2E_CAMPAIGN_CAPTURE === "1") {
        await marketing.getByRole("button", { name: "Kampagne lokal aufzeichnen" }).click();
        await expect(marketing.getByText("0 Kontakte lokal aufgezeichnet.")).toBeVisible();
        await expect(marketing.getByRole("region", { name: "Testaufzeichnungen" }).getByRole("listitem")).toHaveCount(1);
      }
    }
    const appointment = calendar.getByRole("listitem").filter({ hasText: "QA Treatment" }).filter({ hasText: "QA Add-on" })
      .filter({ hasText: refundCase ? refundNote : "QA Add-on" });
    await expect(appointment.filter({ hasText: "Bestätigt" })).toBeVisible();
    if (process.env.BEAUTYHUB_E2E_APPOINTMENT_PAYMENTS === "1") {
      const active = appointment.filter({ hasText: "Bestätigt" });
      await active.getByText("Zahlungen", { exact: true }).click();
      await active.getByLabel("Anzahlung (EUR)").fill("20,00");
      await active.getByLabel("Zahlungsart").selectOption("simulated_card");
      await active.getByRole("button", { name: "Anzahlung erfassen" }).click();
      await expect(active.getByText(/Erfasst 20,00.*Offen 57,00/)).toBeVisible();
      await expect(active.getByText(/Anzahlung .* Simulierte Kartenzahlung .* 20,00/)).toBeVisible();
    }

    if (process.env.BEAUTYHUB_E2E_RETAIL === "1") {
      const voucherCase = process.env.BEAUTYHUB_E2E_VOUCHER === "1";
      const voucherCode = testInfo.project.name + "-SAVE";
      if (voucherCase) {
        await calendar.getByText("Gutscheine verwalten", { exact: true }).click();
        await calendar.getByLabel("Neuer Gutscheincode").fill(voucherCode);
        await calendar.getByLabel("Gutscheinrabatt (EUR)").fill("5,00");
        await calendar.getByRole("button", { name: "Gutschein anlegen" }).click();
        await expect(calendar.getByText(new RegExp(voucherCode, "i"))).toBeVisible();
      }
      await calendar.getByText("Verkauf erfassen", { exact: true }).click();
      const stocked = process.env.BEAUTYHUB_E2E_STOCK_SALE === "1";
      if (stocked) {
        const option = calendar.getByLabel("Lagerartikel").locator("option").filter({ hasText: "QA-" + testInfo.project.name.toUpperCase() });
        await calendar.getByLabel("Lagerartikel").selectOption((await option.getAttribute("value"))!);
      } else {
        await calendar.getByLabel("Artikel", { exact: true }).fill("QA Shampoo " + testInfo.project.name);
        await calendar.getByLabel("Stückpreis (EUR)").fill("12,50");
      }
      await calendar.getByLabel("Menge", { exact: true }).fill("2");
      if (voucherCase) {
        await calendar.getByLabel("Gutscheincode (optional)").fill(voucherCode);
        await calendar.getByRole("button", { name: /Gutschein pr/ }).click();
        await expect(calendar.getByText(/Gutscheinrabatt 5,00/)).toBeVisible();
      }
      await expect(calendar.getByText(voucherCase ? /Gesamtbetrag 20,00/ : /Gesamtbetrag 25,00/)).toBeVisible();
      const [saleResponse] = await Promise.all([
        calendar.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/retail-sales")),
        calendar.getByRole("button", { name: "Verkauf speichern" }).click(),
      ]);
      expect(saleResponse.status()).toBe(201);
      const sale = await saleResponse.json();
      const daily = calendar.getByRole("list", { name: "Zahlungsvorgänge" });
      const movement = daily.getByRole("listitem").filter({ hasText: sale.id.slice(0, 8) });
      await expect(movement.getByText(/Warenverkauf/)).toBeVisible();
      if (process.env.BEAUTYHUB_E2E_RETAIL_REFUND === "1") {
        await movement.getByText("Verkauf erstatten", { exact: true }).click();
        await movement.getByLabel("Erstattung (EUR)").fill("7,50");
        await movement.getByLabel("Grund", { exact: true }).fill("QA return");
        await movement.getByRole("button", { name: "Verkaufserstattung speichern" }).click();
        await expect(movement.getByText(/Erstattbar 17,50/)).toBeVisible();
        await expect(daily.getByText(new RegExp("Verkaufserstattung.*" + sale.id.slice(0, 8)))).toBeVisible();
      }
      const [receipt] = await Promise.all([
        calendar.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/retail-sales/" + sale.id + "/receipt")),
        movement.getByRole("button", { name: "Verkaufsnachweis herunterladen" }).click(),
      ]);
      const receiptText = await receipt.text();
      expect(receiptText).toContain(stocked ? "QA Shampoo" : "QA Shampoo " + testInfo.project.name);
      if (stocked) {
        const inventory = await owner.newPage();
        await inventory.goto(`/unternehmen/${organizationId}?bereich=lager`);
        const product = inventory.getByRole("listitem").filter({ hasText: "QA-" + testInfo.project.name.toUpperCase() });
        await expect(product.getByText(/Bestand 3/)).toBeVisible();
        await product.getByText("Lagerbewegungen", { exact: true }).click();
        await expect(product.getByText(/Verkauf.*-2.*Bestand 3/)).toBeVisible();
      }
      if (voucherCase) expect(receiptText).toContain("Gutscheinrabatt 5,00");
      if (process.env.BEAUTYHUB_E2E_RETAIL_REFUND === "1") expect(receiptText).toContain("Nach Erstattungen 17,50");
    }
    await page.getByRole("link", { name: "Meine Termine", exact: true }).click();
    const confirmed = page.getByRole("listitem").filter({ hasText: "Bestätigt" }).filter({ hasText: "QA Treatment" }).filter({ hasText: "QA Add-on" });
    await expect(confirmed).toBeVisible();
    if (process.env.BEAUTYHUB_E2E_CUSTOMER_PAYMENTS === "1") {
      await confirmed.getByText("Zahlungsverlauf", { exact: true }).click();
      await expect(confirmed.getByText(/Anzahlung.*20,00/)).toBeVisible();
    }
    if (staged) {
      const [calendarFile] = await Promise.all([
        page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/calendar.ics")),
        confirmed.getByRole("button", { name: "Zum Kalender hinzufügen" }).click(),
      ]);
      expect(await calendarFile.text()).toContain("SEQUENCE:0");
    }
    const edit = confirmed.getByRole("button", { name: "Umbuchen" });
    await edit.focus();
    await page.keyboard.press("Enter");
    await expect(confirmed.getByLabel("Neues Datum")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(edit).toBeFocused();
    await expect(edit).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await expect(edit).toHaveAttribute("aria-expanded", "true");
    await confirmed.getByLabel("Neues Datum").fill(day!);
    await confirmed.getByRole("button", { name: "Termine suchen" }).click();
    const rescheduleSlots = confirmed.getByLabel("Verfügbare Termine");
    await expect(rescheduleSlots.locator("option").nth(2)).toBeAttached();
    await expect(confirmed.getByRole("status")).toHaveText("Freie Termine gefunden.");
    const alternative = (await rescheduleSlots.locator("option").nth(2).getAttribute("value"))!;
    expect(alternative).not.toBe(first);
    await rescheduleSlots.selectOption(alternative);
    const [rescheduled] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/reschedule")),
      confirmed.getByRole("button", { name: "Umbuchung bestätigen" }).click(),
    ]);
    expect(rescheduled.status()).toBe(200);
    const moved = await rescheduled.json();
    expect(moved.id).toBe(bookingId);
    expect(moved.startsAt).not.toBe(booking.startsAt);
    await expect(confirmed.getByRole("button", { name: "Umbuchung bestätigen" })).toBeHidden();
    await expect(edit).toBeFocused();
    await expect(confirmed.getByRole("status").filter({ hasText: "Termin umgebucht." })).toBeAttached();
    page.once("dialog", (dialog) => dialog.accept());
    await confirmed.getByRole("button", { name: "Stornieren" }).click();
    await expect(confirmed).toHaveCount(0);
    const cancelledBooking = page.getByRole("listitem").filter({ hasText: "QA Treatment" })
      .filter({ has: page.getByRole("status").filter({ hasText: "Termin storniert." }) });
    await expect(cancelledBooking.locator("p[tabindex='-1']")).toBeFocused();
    await calendar.reload();
    await calendar.locator("#calendar-date").fill(day!);
    await expect(appointment.filter({ hasText: "Storniert" }).last()).toBeVisible();
    if (refundCase) {
      const cancelled = appointment.filter({ hasText: "Storniert" }).last();
      await cancelled.getByText("Zahlungen", { exact: true }).click();
      await cancelled.getByText("Erstattung erfassen", { exact: true }).click();
      await cancelled.getByLabel("Erstattung (EUR)").fill("8,50");
      await cancelled.getByLabel("Grund", { exact: true }).fill("Teilweise Erstattung");
      await cancelled.getByRole("button", { name: "Erstattung speichern" }).click();
      await expect(cancelled.getByText(/Erstattet 8,50/)).toBeVisible();
      const [receipt] = await Promise.all([
        calendar.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/receipt")),
        cancelled.getByRole("button", { name: "Zahlungsnachweis herunterladen" }).click(),
      ]);
      expect(receipt.status()).toBe(200);
      expect(await receipt.text()).toContain("Erstattung");
      if (process.env.BEAUTYHUB_E2E_CUSTOMER_PAYMENTS === "1") {
        await page.reload();
        const cancelledBooking = page.getByRole("listitem").filter({ hasText: refundNote }).filter({ hasText: "Storniert" });
        await cancelledBooking.getByText("Zahlungsverlauf", { exact: true }).click();
        await expect(cancelledBooking.getByText(/Erstattung 8,50/)).toBeVisible();
      }
      if (process.env.BEAUTYHUB_E2E_RECONCILIATION === "1") {
        const daily = calendar.getByRole("list", { name: "Zahlungsvorgänge" });
        await expect(daily.getByText(new RegExp("Erstattung.*" + bookingId!.slice(0, 8)))).toBeVisible();
        await expect(daily.getByText(new RegExp("Anzahlung.*" + bookingId!.slice(0, 8)))).toBeVisible();
        await calendar.getByLabel(/Gezählte Barbewegung/).fill("5,00");
        await expect(calendar.getByText(/Abweichung 5,00/)).toBeVisible();
      }
    }
    if (process.env.BEAUTYHUB_E2E_ACCOUNT_EXPORT === "1") {
      await page.goto("/konto");
      const pendingDownload = page.waitForEvent("download");
      await page.getByTestId("button-export-data").click();
      const file = await pendingDownload;
      expect(file.suggestedFilename()).toBe("beautyhub-datenexport.json");
      const exported = JSON.parse(await readFile(await file.path(), "utf8"));
      expect(exported.records.bookings).toContainEqual(expect.objectContaining({ id: bookingId, status: "cancelled" }));
      expect(exported.profile).not.toHaveProperty("externalIdentityId");
      expect(exported.records.bookings.find((row: { id: string }) => row.id === bookingId)).not.toHaveProperty("requestHash");
      expect(exported.records.supportCases).toEqual([]);
    }
    if (process.env.BEAUTYHUB_E2E_SAAS === "1") {
      const billing = await owner.newPage();
      await billing.goto(`/unternehmen/${organizationId}?bereich=organisation`);
      await expect(billing.getByText(/^(Professional · Testphase|Enterprise · Gekündigt) ·/)).toBeVisible();
      const offers = ["starter", "enterprise"];
      for (const offer of offers) {
        await billing.getByTestId("select-saas-" + offer).click();
        await billing.getByTestId("confirm-saas-change").click();
        const label = offer === "starter" ? "Starter" : "Enterprise";
        await expect(billing.getByText(new RegExp("^" + label + " · Aktiv ·"))).toBeVisible();
      }
      await billing.getByRole("button", { name: "Tarif kündigen" }).click();
      await billing.getByTestId("confirm-saas-change").click();
      await expect(billing.getByText(/^Enterprise · Gekündigt ·/)).toBeVisible();
      await expect(billing.getByRole("listitem").filter({ hasText: "Tarif aktiviert · Starter" }).first()).toBeVisible();
      await expect(billing.getByRole("listitem").filter({ hasText: "Tarif aktiviert · Enterprise" }).first()).toBeVisible();
    }
    if (process.env.BEAUTYHUB_E2E_ANALYTICS === "1") {
      const analytics = await owner.newPage();
      await analytics.goto(`/unternehmen/${organizationId}?bereich=berichte`);
      await analytics.getByLabel("Bis", { exact: true }).fill(day!);
      await analytics.getByLabel("Von", { exact: true }).fill(day!);
      const table = analytics.getByRole("table");
      const location = analytics.getByRole("combobox", { name: "Standort" });
      const locationValue = await location.locator("option").nth(1).getAttribute("value");
      await location.selectOption(locationValue!);
      const row = table.getByRole("row").nth(1);
      await expect(row.getByRole("cell").nth(2)).toHaveText(/^[1-9]\d*$/);
      await expect(table.getByRole("row")).toHaveCount(2);
      await expect(analytics.getByRole("heading", { name: "Leistungen", exact: true })).toBeVisible();
      await expect(analytics.getByRole("heading", { name: "Neue und wiederkehrende Kunden" })).toBeVisible();
      await expect(analytics.getByRole("heading", { name: "Kapazitätsauslastung" })).toBeVisible();
      await expect(analytics.getByText(/0 von 540 Min\. belegt/)).toBeVisible();
      await expect(analytics.getByRole("heading", { name: "Aktueller Lagerbestand" })).toBeVisible();
      await expect(analytics.getByRole("heading", { name: "Marketing für den gesamten Betrieb" })).toBeVisible();
    }
    if (process.env.BEAUTYHUB_E2E_REVIEW_FLOW === "1") {
      page.setDefaultTimeout(12_000);
      if (!baseURL || new URL(baseURL).origin !== "http://localhost:18083" ||
          !bookingId || !/^[0-9a-f-]{36}$/i.test(bookingId)) throw new Error("Expected the isolated review fixture.");
      const fixtureProject = homeSlots ? "beautyhub-review-flow-qa" : "beautyhub-review-flow";
      const dbContainer = fixtureProject + "-db-1";
      const project = execFileSync("docker", ["inspect", "--format",
        '{{index .Config.Labels "com.docker.compose.project"}}', dbContainer], { encoding: "utf8" }).trim();
      expect(project).toBe(fixtureProject);
      const fixtureSql = (statement: string) => execFileSync("docker",
        ["exec", dbContainer, "psql", "-v", "ON_ERROR_STOP=1", "-U", "beautyhub", "-d", "beautyhub", "-c", statement],
        { encoding: "utf8" });
      const loyalty = process.env.BEAUTYHUB_E2E_LOYALTY === "1";
      const rewards = process.env.BEAUTYHUB_E2E_RETENTION === "1";
      const awardPoints = rewards ? 50 : 8;
      const business = await owner.newPage();
      business.setDefaultTimeout(12_000);
      if (loyalty) {
        await business.goto(`/unternehmen/${organizationId}?bereich=marketing`);
        const setting = business.getByLabel("Punkte pro abgeschlossenem Termin");
        await expect(setting).toBeVisible();
        if (await setting.inputValue() !== String(awardPoints)) {
          await setting.fill(String(awardPoints));
          await business.getByRole("button", { name: "Treueprogramm speichern" }).click();
          await expect(business.getByText("Treueprogramm gespeichert.")).toBeVisible();
        }
      }
      // Move the synthetic booking into the past for the completion and review exercises.
      const fixtureStatus = loyalty ? "confirmed" : "completed";
      expect(fixtureSql("update bookings set status='" + fixtureStatus + "', starts_at=now()-interval '2 hours', "
        + "ends_at=now()-interval '2 hours'+(ends_at-starts_at) where id='" + bookingId + "'")).toContain("UPDATE 1");
      let expectedLoyalty: number | undefined;
      if (loyalty) {
        const balances = await customer.request.get("/api/me/loyalty");
        expect(balances.ok()).toBe(true);
        const entries: { organizationId: string; points: number }[] = await balances.json();
        expectedLoyalty = (entries.find((entry) => entry.organizationId === organizationId)?.points ?? 0) + awardPoints;
        const completion = await owner.request.post(`/api/organizations/${organizationId}/booking-calendar/${bookingId}/status`,
          { data: { status: "completed" } });
        expect(completion.status()).toBe(204);
      }
      await page.goto("/konto");
      if (expectedLoyalty !== undefined) {
        await expect(page.getByText(new RegExp("· " + expectedLoyalty + " Punkte$"))).toBeVisible();
      }
      if (rewards) {
        await page.getByRole("button", { name: "50 Punkte gegen 5 € eintauschen" }).click();
        await expect(page.getByRole("heading", { name: "Treuegutscheine" })).toBeVisible();
        await expect(page.getByText(new RegExp("· " + ((expectedLoyalty ?? 50) - 50) + " Punkte$"))).toBeVisible();

        const packName = "QA Paket " + testInfo.project.name + " " + organizationId!.slice(0, 8);
        await business.getByLabel("Paketname").fill(packName);
        await business.getByRole("combobox", { name: "Enthaltene Leistung" }).selectOption({ label: "QA Treatment" });
        await business.getByLabel("Paketpreis (EUR)").fill("99");
        await business.getByRole("button", { name: "Paket erstellen" }).click();
        await expect(business.getByRole("listitem").filter({ hasText: packName })).toBeVisible();
        await page.reload();
        const packageOffer = page.getByRole("listitem").filter({ hasText: packName });
        await packageOffer.getByRole("button", { name: "Paketkauf simulieren" }).click();
        await expect(page.getByText("Paket zum Konto hinzugefügt.")).toBeVisible();
        await expect(page.getByRole("listitem").filter({ hasText: packName }).filter({ hasText: "2 Termine übrig" })).toBeVisible();
        const memberName = "QA Mitgliedschaft " + testInfo.project.name + " " + organizationId!.slice(0, 8);
        await business.getByRole("combobox", { name: "Angebotstyp" }).selectOption("membership");
        await business.getByLabel("Paketname").fill(memberName);
        await business.getByLabel("Paketpreis (EUR)").fill("89");
        await business.getByRole("button", { name: "Paket erstellen" }).click();
        await expect(business.getByRole("listitem").filter({ hasText: memberName })).toBeVisible();
        await page.reload();
        await page.getByRole("listitem").filter({ hasText: memberName })
          .getByRole("button", { name: "Paketkauf simulieren" }).click();
        await expect(page.getByRole("listitem").filter({ hasText: memberName }).filter({ hasText: "2 Termine übrig" })).toBeVisible();

        await calendar.getByText("Gutscheine verwalten", { exact: true }).click();
        await calendar.getByLabel("Gutscheinrabatt (EUR)").fill("10");
        await calendar.getByRole("button", { name: "Geschenkgutschein erstellen" }).click();
        await expect(calendar.getByText(/^GESCHENK-[0-9A-F]{23}$/)).toBeVisible();

      }
      const completed = page.getByRole("listitem").filter({ hasText: "QA Treatment" }).filter({ hasText: "Abgeschlossen" }).first();
      await completed.getByText("Termin bewerten", { exact: true }).click();
      await completed.getByRole("combobox", { name: "Bewertung" }).selectOption("4");
      const reviewText = "QA review " + testInfo.project.name;
      const reportText = "QA moderation " + bookingId.slice(0, 8);
      const replyText = "QA reply " + testInfo.project.name;
      await completed.getByLabel("Öffentlicher Kommentar (optional)").fill(reviewText);
      await completed.getByRole("button", { name: "Bewertung veröffentlichen" }).click();
      await expect(completed.getByText("Deine Bewertung · 4/5")).toBeVisible();

      await business.goto(`/unternehmen/${organizationId}?bereich=marketing`);
      const staffReview = business.getByRole("listitem").filter({ hasText: reviewText });
      await staffReview.getByLabel("Öffentliche Antwort").fill(replyText);
      await staffReview.getByRole("button", { name: "Antwort speichern" }).click();
      await expect(staffReview.getByText("Antwort gespeichert.")).toBeVisible();

      await business.goto(`/salons/${slug}`);
      const publicReview = business.getByRole("listitem").filter({ hasText: reviewText });
      await expect(publicReview.getByText(replyText, { exact: true })).toBeVisible();
      await publicReview.getByText("Bewertung melden", { exact: true }).click();
      await publicReview.getByRole("combobox", { name: "Grund" }).selectOption("other");
      await publicReview.getByLabel("Weitere Angaben (optional)").fill(reportText);
      await publicReview.getByRole("button", { name: "Meldung senden" }).click();
      await expect(publicReview.getByText("Meldung eingegangen.")).toBeVisible();

      const published = await (await page.request.get(`/api/businesses/${slug}/reviews`)).json();
      const matchingReview = published.reviews.find((row: { comment: string }) => row.comment === reviewText);
      expect(matchingReview).toBeTruthy();
      const reviewId: string = matchingReview.id;
      const profile = await owner.request.get("/api/me");
      expect(profile.ok()).toBe(true);
      const { id: ownerId } = await profile.json();
      if (!/^[0-9a-f-]{36}$/i.test(ownerId)) throw new Error("Expected a fixture account ID.");
      expect(fixtureSql("update users set is_platform_admin=true where id='" + ownerId + "'")).toContain("UPDATE 1");
      try {
        await business.goto("/konto");
        if (homeSlots) {
          await business.getByRole("link", { name: "Startseitengalerie" }).click();
          const alt = "Startseitenfoto QA";
          await business.getByLabel("Foto", { exact: true }).setInputFiles({
            name: "homepage.png", mimeType: "image/png", buffer: await readFile("tests/fixtures/gallery-photo.png"),
          });
          await business.getByLabel("Bildbeschreibung").fill(alt);
          const [upload] = await Promise.all([
            business.waitForResponse((reply) => reply.request().method() === "POST" && new URL(reply.url()).pathname === "/api/admin/homepage-gallery"),
            business.getByRole("button", { name: "Foto hochladen" }).click(),
          ]);
          expect(upload.status()).toBe(201);
          const { id } = await upload.json();
          try {
            const hero = business.getByLabel("Hauptbild der Startseite");
            await hero.selectOption(id);
            await expect(hero).toHaveValue(id);
            const category = business.getByLabel("Friseure", { exact: true });
            await category.selectOption(id);
            await expect(category).toHaveValue(id);
            const guest = await browser.newPage({ baseURL, ...device });
            try {
              await guest.goto("/");
              await expect(guest.getByRole("img", { name: alt })).toHaveAttribute("src", "/api/marketplace/homepage-images/" + id);
              await expect(guest.getByRole("region", { name: "Nach Kategorie entdecken" }).getByRole("link", { name: "Friseure", exact: true }).locator("img"))
                .toHaveAttribute("src", "/api/marketplace/homepage-images/" + id);
            } finally { await guest.close(); }
          } finally {
            expect((await owner.request.delete("/api/admin/homepage-gallery/" + id)).status()).toBe(204);
          }
          await business.goto("/konto");
        }
        await business.getByRole("link", { name: "Bewertungsmoderation" }).click();
        await expect(business.getByText(reportText, { exact: true })).toBeVisible();
        await business.getByTestId("hide-review-" + reviewId).click();
        await expect(business.getByTestId("restore-review-" + reviewId)).toBeVisible();
        const hiddenReviews = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/businesses/${slug}/reviews`);
        await page.goto(`/salons/${slug}`);
        const hiddenPage = await (await hiddenReviews).json();
        expect(hiddenPage.reviews.map((row: { comment: string }) => row.comment)).not.toContain(reviewText);
        await expect(page.getByText(reviewText, { exact: true })).toHaveCount(0);
        await business.getByTestId("restore-review-" + reviewId).click();
        await expect(business.getByTestId("restore-review-" + reviewId)).toHaveCount(0);
        await page.reload();
        await expect(page.getByText(reviewText, { exact: true })).toBeVisible();
        if (process.env.BEAUTYHUB_E2E_PLATFORM_OVERVIEW === "1") {
          await business.goto("/konto");
          await business.getByRole("link", { name: "Plattformübersicht" }).click();
          await expect(business.getByRole("heading", { name: "Simulierte Abrechnung" })).toBeVisible();
          await expect(business.getByRole("heading", { name: "Supportfälle" })).toBeVisible();
          const control = business.getByRole("checkbox", { name: "Neue Supportanfragen erlauben" });
          await expect(control).toBeChecked();
          await control.uncheck();
          await business.getByRole("button", { name: "Einstellungen speichern" }).click();
          await expect(business.getByText("Plattformeinstellungen gespeichert.")).toBeVisible();
          const request = () => customer.request.post("/api/me/support-cases", {
            data: { subject: "QA overview " + bookingId.slice(0, 8), body: "Intake fixture.", requestId: crypto.randomUUID() },
          });
          expect((await request()).status()).toBe(409);
          await control.check();
          await business.getByRole("button", { name: "Einstellungen speichern" }).click();
          await expect(business.getByText("Plattformeinstellungen gespeichert.")).toBeVisible();
          expect((await request()).status()).toBe(201);
          await expect(business.getByText(/Neue Supportanfragen erlauben · Nein/).first()).toBeVisible();
        }
        if (process.env.BEAUTYHUB_E2E_SUPPORT === "1") {
          const subject = "QA support " + bookingId.slice(0, 8);
          await page.goto("/konto");
          await page.getByRole("link", { name: "Meine Supportanfragen" }).click();
          await page.getByLabel("Betreff").fill(subject);
          await page.getByLabel("Nachricht").fill("Bitte prüft meine Buchung.");
          await page.getByRole("button", { name: "Anfrage senden" }).click();
          await expect(page.getByText("Bitte prüft meine Buchung.", { exact: true })).toBeVisible();
          await business.goto("/konto");
          await business.getByRole("link", { name: "Supportfälle" }).click();
          await business.getByRole("button", { name: subject + " · Offen", exact: true }).click();
          await business.getByLabel("Antwort", { exact: true }).fill("Wir haben deine Buchung geprüft.");
          await business.getByRole("button", { name: "Antwort senden" }).click();
          await expect(business.getByText("Wir haben deine Buchung geprüft.", { exact: true })).toBeVisible();
          await business.getByRole("button", { name: "Anfrage schließen" }).click();
          await expect(business.getByRole("button", { name: "Anfrage wieder öffnen" })).toBeVisible();
          await page.reload();
          await page.getByRole("button", { name: subject + " · Geschlossen", exact: true }).click();
          await expect(page.getByText("Wir haben deine Buchung geprüft.", { exact: true })).toBeVisible();
          await expect(page.getByRole("button", { name: "Antwort senden" })).toHaveCount(0);
        }
        if (process.env.BEAUTYHUB_E2E_PLATFORM_CUSTOMERS === "1") {
          const profile = await customer.request.get("/api/me");
          expect(profile.ok()).toBe(true);
          const { id, email } = await profile.json();
          expect((await customer.request.post("/api/me/deletion-requests")).ok()).toBe(true);
          await business.goto("/konto");
          await business.getByRole("link", { name: "Kundenkonten" }).click();
          await business.getByLabel("Name oder E-Mail").fill(email);
          await business.getByRole("button", { name: "Suchen" }).click();
          await business.getByText("Kontobezogene Datensätze prüfen", { exact: true }).click();
          await expect(business.getByText("Bestätigte Termine", { exact: true })).toBeVisible();
          await business.getByTestId("review-deletion-" + id).click();
          await expect(business.getByText("Sichtung protokolliert.")).toBeVisible();
          await business.getByRole("combobox", { name: "Ansicht" }).selectOption("reviewed");
          await expect(business.getByText(/Gesichtet am/)).toBeVisible();
          if (process.env.BEAUTYHUB_E2E_TEST_ERASURE === "1") {
            await business.getByRole("button", { name: "Testlöschung vorbereiten" }).click();
            await business.getByTestId("confirm-test-erasure-" + id).click();
            await expect(business.getByText("Aufbewahrte Datensätze erfordern eine Einzelprüfung.")).toBeVisible();
          }
          const profileAfter = await customer.request.get("/api/me");
          expect(profileAfter.ok()).toBe(true);
          expect((await profileAfter.json()).deletionRequested).toBe(true);
          await page.goto("/konto");
          await page.getByRole("button", { name: "Löschanfrage zurückziehen" }).click();
          await expect(page.getByText("Löschanfrage zurückgezogen.", { exact: true })).toBeVisible();
          expect((await (await customer.request.get("/api/me")).json()).deletionRequested).toBe(false);
          expect((await owner.request.get("/api/admin/customers/" + id + "/deletion-assessment")).status()).toBe(404);

        }
        if (process.env.BEAUTYHUB_E2E_PLATFORM_BUSINESSES === "1") {
          const workspace = await owner.request.get(`/api/organizations/${organizationId}/workspace`);
          expect(workspace.ok()).toBe(true);
          const { name } = await workspace.json();
          await business.goto("/konto");
          await business.getByRole("link", { name: "Betriebe verwalten" }).click();
          await business.getByLabel("Betriebsname").fill(name);
          await business.getByRole("button", { name: "Suchen" }).click();
          const action = async (value: string) => {
            await business.getByTestId(value + "-business-" + organizationId).click();
            await business.getByTestId("confirm-platform-business").click();
          };
          await action("verify");
          await expect(business.getByTestId("unverify-business-" + organizationId)).toBeVisible();
          await page.reload();
          await expect(page.getByText("Verifizierter Betrieb", { exact: true })).toBeVisible();
          await action("suspend");
          await expect(business.getByTestId("reactivate-business-" + organizationId)).toBeVisible();
          expect((await page.request.get(`/api/businesses/${slug}`)).status()).toBe(404);
          await action("reactivate");
          await expect(business.getByTestId("suspend-business-" + organizationId)).toBeVisible();
          await action("unverify");
          await expect(business.getByTestId("verify-business-" + organizationId)).toBeVisible();
          await page.reload();
          await expect(page.getByTestId("text-business-name")).toBeVisible();
          await expect(page.getByText("Verifizierter Betrieb", { exact: true })).toHaveCount(0);
        }
      } finally {
        if (process.env.BEAUTYHUB_E2E_PLATFORM_OVERVIEW === "1") {
          fixtureSql("update platform_settings set support_intake_open=true where id=1");
        }
        fixtureSql("update users set is_platform_admin=false where id='" + ownerId + "'");
      }
    }
  } finally {
    try {
      if (bookingId) await customer.request.post(`/api/me/bookings/${bookingId}/cancel`);
    } finally {
      await Promise.all([customer.close(), owner.close()]);
    }
  }
});
