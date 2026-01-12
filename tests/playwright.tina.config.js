import { defineConfig } from "@playwright/test";

/**
 * Playwright config for TinaCMS admin E2E tests.
 * Uses tina:dev which runs the full TinaCMS backend locally.
 *
 * Run with: npx playwright test --config=tests/playwright.tina.config.js
 */
export default defineConfig({
  testDir: "./",
  testMatch: "*.tina.spec.js",
  timeout: 60000,
  retries: 0,
  workers: 1, // Run serially to avoid file conflicts
  reporter: "list",
  use: {
    baseURL: "http://localhost:8080",
    headless: true,
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run tina:dev",
    url: "http://localhost:8080",
    reuseExistingServer: !process.env.CI,
    timeout: 180000, // TinaCMS takes longer to start
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
