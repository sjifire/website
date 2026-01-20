import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * Governance Meeting E2E Tests
 *
 * Tests that the governance page correctly displays meeting information
 * based on the data in governance_meeting.json, including override dates.
 */

const GOVERNANCE_FILE = path.join(
  process.cwd(),
  "src/_data/governance_meeting.json"
);

/**
 * Wait for Eleventy to rebuild by polling the page until expected content appears.
 * This is more reliable than a fixed timeout since rebuild times vary.
 */
async function waitForEleventyRebuild(page, url, expectedText, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    await page.goto(url, { waitUntil: "networkidle" });
    const content = await page.locator(".sidebar-block").first().locator("strong").first().textContent();
    if (content && content.includes(expectedText)) {
      return;
    }
    // Wait before retrying
    await page.waitForTimeout(1000);
  }
  // Final attempt - let the test assertion handle the failure
  await page.goto(url, { waitUntil: "networkidle" });
}

test.describe("Governance Meeting Override", () => {
  // These tests must run serially because they modify a shared data file
  test.describe.configure({ mode: 'serial' });

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

  test("displays override date when set to future date", async ({ page }) => {
    // Set a known future override date (use fixed date far in future)
    const data = JSON.parse(fs.readFileSync(GOVERNANCE_FILE, "utf-8"));

    data.next_meeting_override = {
      enabled: true,
      date: "2030-03-15T00:00:00.000Z",
      time: "10:30am",
      note: "Special Budget Meeting",
    };

    fs.writeFileSync(GOVERNANCE_FILE, JSON.stringify(data, null, 2));

    // Poll until Eleventy rebuilds with our expected content
    await waitForEleventyRebuild(page, "/about/governance/", "March 15");

    const meetingSection = page.locator(".sidebar-block").first();
    const dateTimeText = await meetingSection.locator("strong").first().textContent();

    // Should show March 15, 2030 at 10:30 AM
    expect(dateTimeText).toContain("March 15");
    expect(dateTimeText).toContain("10:30 AM");

    // Should show the override note
    const noteElement = meetingSection.locator("em");
    await expect(noteElement).toBeVisible();
    const noteText = await noteElement.textContent();
    expect(noteText).toContain("Special Budget Meeting");
  });

  test("falls back to regular schedule when override is disabled", async ({ page }) => {
    const data = JSON.parse(fs.readFileSync(GOVERNANCE_FILE, "utf-8"));

    // Set override but disable it
    data.next_meeting_override = {
      enabled: false,
      date: "2030-06-15T00:00:00.000Z",
      time: "2:30pm",
      note: "This should not appear",
    };

    fs.writeFileSync(GOVERNANCE_FILE, JSON.stringify(data, null, 2));

    // Poll until Eleventy rebuilds - we look for absence of override note
    // by waiting for the page to NOT show March 15 (from previous test)
    for (let i = 0; i < 10; i++) {
      await page.goto("/about/governance/", { waitUntil: "networkidle" });
      const noteElement = page.locator(".sidebar-block").first().locator("em");
      const isVisible = await noteElement.isVisible();
      if (!isVisible) break;
      await page.waitForTimeout(1000);
    }

    const meetingSection = page.locator(".sidebar-block").first();

    // Should NOT show the override note since override is disabled
    const noteElement = meetingSection.locator("em");
    await expect(noteElement).not.toBeVisible();

    // Should still show a valid future date (from regular schedule)
    const dateTimeText = await meetingSection.locator("strong").first().textContent();
    expect(dateTimeText).toMatch(/\w+, \w+ \d+, \d{4}/);
  });

  test("preserves calendar date regardless of timezone", async ({ page }) => {
    const data = JSON.parse(fs.readFileSync(GOVERNANCE_FILE, "utf-8"));

    // Use a specific date - UTC midnight on the 20th
    // This tests that Jan 20 UTC doesn't become Jan 19 in Pacific time
    data.next_meeting_override = {
      enabled: true,
      date: "2030-01-20T00:00:00.000Z",
      time: "3:00pm",
      note: "Timezone test",
    };

    fs.writeFileSync(GOVERNANCE_FILE, JSON.stringify(data, null, 2));

    // Poll until Eleventy rebuilds with our expected content
    await waitForEleventyRebuild(page, "/about/governance/", "January 20");

    const meetingSection = page.locator(".sidebar-block").first();
    const dateTimeText = await meetingSection.locator("strong").first().textContent();

    // Should show January 20, not January 19
    expect(dateTimeText).toContain("January 20");
    expect(dateTimeText).toContain("3:00 PM");
  });
});
