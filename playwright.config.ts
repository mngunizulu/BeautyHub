import { defineConfig, devices } from "@playwright/test";

// Workflows must already be running. Do not start duplicate application servers.
export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "generated-artifacts/playwright",
  reporter: [["list"], ["html", { outputFolder: "generated-artifacts/playwright-report", open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:80",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
