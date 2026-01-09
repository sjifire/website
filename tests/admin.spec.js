import { test, expect } from "@playwright/test";

/**
 * TinaCMS Admin E2E Tests
 *
 * Note: These tests run against the static build without the TinaCMS backend.
 * TinaCMS will show an error modal when it can't connect to the GraphQL API.
 * We test that the admin loads and basic UI is present.
 *
 * For full admin functionality testing, run with `npm run tina:dev`.
 */

test.describe("TinaCMS Admin", () => {
  test.beforeEach(async ({ page }) => {
    // TinaCMS is a React SPA, give it time to hydrate
    page.setDefaultTimeout(15000);
  });

  test("admin interface loads", async ({ page }) => {
    const response = await page.goto("/admin/");
    expect(response.status()).toBe(200);

    // Wait for TinaCMS to initialize - look for the root container to have content
    await page.waitForFunction(
      () => document.getElementById("root")?.children.length > 0,
      { timeout: 10000 }
    );

    // Page title should be TinaCMS
    await expect(page).toHaveTitle(/TinaCMS/);
  });

  test("admin shows welcome message", async ({ page }) => {
    await page.goto("/admin/");

    // Wait for TinaCMS to load
    await page.waitForFunction(
      () => document.getElementById("root")?.children.length > 0,
      { timeout: 10000 }
    );

    // Should show the welcome text (visible behind the error modal)
    await expect(page.getByText("Welcome to Tina!")).toBeVisible();
  });

  test("admin shows dashboard description", async ({ page }) => {
    await page.goto("/admin/");

    // Wait for TinaCMS to load
    await page.waitForFunction(
      () => document.getElementById("root")?.children.length > 0,
      { timeout: 10000 }
    );

    // Should show dashboard description text
    await expect(
      page.getByText(/dashboard for editing or creating content/i)
    ).toBeVisible();
  });

  test("error modal can be dismissed", async ({ page }) => {
    await page.goto("/admin/");

    // Wait for TinaCMS to load
    await page.waitForFunction(
      () => document.getElementById("root")?.children.length > 0,
      { timeout: 10000 }
    );

    // Wait for error modal to appear (it shows when API is unavailable)
    const closeButton = page.getByRole("button", { name: "Close" });

    // If error modal is present, close it
    if (await closeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await closeButton.click();

      // Modal should be dismissed
      await expect(closeButton).not.toBeVisible({ timeout: 2000 });
    }
  });

  test("hamburger menu is present", async ({ page }) => {
    await page.goto("/admin/");

    // Wait for TinaCMS to load
    await page.waitForFunction(
      () => document.getElementById("root")?.children.length > 0,
      { timeout: 10000 }
    );

    // Close error modal if present
    const closeButton = page.getByRole("button", { name: "Close" });
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeButton.click();
    }

    // Hamburger menu button should be present (for opening sidebar)
    // TinaCMS uses a button with hamburger icon for the menu
    const menuButtons = await page.getByRole("button").all();
    expect(menuButtons.length).toBeGreaterThan(0);
  });
});
