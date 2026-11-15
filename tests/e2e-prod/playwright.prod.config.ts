import { defineConfig, devices } from "@playwright/test";

// Post-deployment smoke test against PRODUCTION. Creates a temporary admin and a throwaway album,
// verifies the weekly flow (no purchases) and removes everything at the end.
// Run only on purpose:  PROD_SMOKE=1 npx playwright test -c tests/e2e-prod/playwright.prod.config.ts
if (process.env.PROD_SMOKE !== "1") throw new Error("Set PROD_SMOKE=1 to run the production smoke test on purpose.");

export default defineConfig({
  testDir: ".",
  timeout: 180_000,
  expect: { timeout: 45_000 },
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./global-setup.ts",
  use: { baseURL: "https://visionpelusa.com", trace: "retain-on-failure", ...devices["Desktop Chrome"] },
});
