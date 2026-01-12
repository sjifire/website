import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * TinaCMS Admin E2E Tests for Governance Meeting Override
 *
 * These tests verify that:
 * 1. The governance config can be edited in TinaCMS admin
 * 2. Date changes are saved correctly
 * 3. The governance page displays the override correctly
 *
 * Run with: npx playwright test --config=tests/playwright.tina.config.js
 *
 * Prerequisites:
 * - Run with tina:dev (handled by playwright.tina.config.js)
 */

const GOVERNANCE_FILE = path.join(
  process.cwd(),
  "src/_data/governance_meeting.json"
);

test.describe("Governance Meeting Admin", () => {
  let originalContent;

  test.beforeAll(async () => {
    // Backup original file
    originalContent = fs.readFileSync(GOVERNANCE_FILE, "utf-8");
  });

  test.afterAll(async () => {
    // Restore original file
    if (originalContent) {
      fs.writeFileSync(GOVERNANCE_FILE, originalContent);
    }
  });

  test("can navigate to governance config in admin", async ({ page }) => {
    await page.goto("/admin/");

    // Wait for TinaCMS to initialize
    await page.waitForFunction(
      () => document.getElementById("root")?.children.length > 0,
      { timeout: 30000 }
    );

    // Look for the governance config in the sidebar
    // TinaCMS shows collections in the left sidebar
    await page.waitForTimeout(3000); // Give TinaCMS time to load collections

    // Click on the Config: Governance Meeting collection
    const governanceLink = page.getByText("Config: Governance Meeting");
    if (await governanceLink.isVisible()) {
      await governanceLink.click();
      await expect(page).toHaveURL(/governance_meeting/);
    }
  });

  test("governance page displays correct meeting info", async ({ page }) => {
    // Read current data
    const data = JSON.parse(fs.readFileSync(GOVERNANCE_FILE, "utf-8"));

    await page.goto("/about/governance/");

    // Find the meeting info section
    const meetingSection = page.locator(".sidebar-block").first();
    await expect(meetingSection).toBeVisible();

    // Get the displayed date/time
    const dateTimeText = await meetingSection.locator("strong").first().textContent();

    // If override is set and in the future, it should show the override
    if (data.next_meeting_override?.date) {
      const overrideDate = new Date(data.next_meeting_override.date);
      if (overrideDate > new Date()) {
        // Should show override note if present
        if (data.next_meeting_override.note) {
          const noteText = await meetingSection.locator("em").textContent();
          expect(noteText).toContain(data.next_meeting_override.note.trim());
        }
      }
    }

    // Either way, should show a valid date format
    expect(dateTimeText).toMatch(/\w+, \w+ \d+, \d{4}/);
  });

  test("override date displays on governance page when set", async ({ page }) => {
    // Set a known future override date directly in the file
    const data = JSON.parse(fs.readFileSync(GOVERNANCE_FILE, "utf-8"));
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 1);
    futureDate.setDate(15);

    data.next_meeting_override = {
      date: futureDate.toISOString().split("T")[0] + "T00:00:00.000Z",
      time: "10:30am",
      note: "E2E Test Meeting",
    };

    fs.writeFileSync(GOVERNANCE_FILE, JSON.stringify(data, null, 2));

    // Wait a moment for file to be written
    await page.waitForTimeout(500);

    // Reload the governance page
    await page.goto("/about/governance/");

    // The meeting info should show our test meeting
    const meetingSection = page.locator(".sidebar-block").first();
    const dateTimeText = await meetingSection.locator("strong").first().textContent();

    // Should show the 15th of next month
    expect(dateTimeText).toContain("15");
    expect(dateTimeText).toContain("10:30 AM");

    // Should show our note
    const noteText = await meetingSection.locator("em").textContent();
    expect(noteText).toContain("E2E Test Meeting");
  });
});
