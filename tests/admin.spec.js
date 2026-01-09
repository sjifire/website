import { test, expect } from "@playwright/test";

/**
 * TinaCMS Admin E2E Tests
 *
 * Note: These tests run against the static build without the TinaCMS backend.
 * TinaCMS will show an error modal when it can't connect to the GraphQL API.
 * We test that the admin loads and basic structure is present.
 *
 * For full admin functionality testing, run with `npm run tina:dev`.
 */

test.describe("TinaCMS Admin", () => {
  test.beforeEach(async ({ page }) => {
    // TinaCMS is a React SPA, give it time to hydrate
    page.setDefaultTimeout(15000);
  });

  test("admin page returns 200", async ({ page }) => {
    const response = await page.goto("/admin/");
    expect(response.status()).toBe(200);
  });

  test("admin interface initializes", async ({ page }) => {
    await page.goto("/admin/");

    // Wait for TinaCMS to initialize - look for the root container to have content
    await page.waitForFunction(
      () => document.getElementById("root")?.children.length > 0,
      { timeout: 10000 }
    );

    // Page title should be TinaCMS
    await expect(page).toHaveTitle(/TinaCMS/);
  });

  test("admin page has root element", async ({ page }) => {
    await page.goto("/admin/");

    // The admin page should have the #root element for React
    const root = page.locator("#root");
    await expect(root).toBeAttached();
  });
});
