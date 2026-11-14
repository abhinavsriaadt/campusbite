// End-to-end tests: `npx playwright test` (or `npm run e2e`).
// Needs the backend (docker compose up, demo data seeded) and the frontend (npm run dev).
// Uses the locally installed Google Chrome, so no browser download is needed.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1, // the journey tests share one database and run in order
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    channel: process.env.CHROME_PATH ? undefined : "chrome",
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
    viewport: { width: 1366, height: 900 },
    actionTimeout: 15_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
