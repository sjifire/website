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

test.describe("Governance Meeting Override", () => {
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
    // Set a known future override date
    const data = JSON.parse(fs.readFileSync(GOVERNANCE_FILE, "utf-8"));
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 1);
    futureDate.setDate(15);

    data.next_meeting_override = {
      date: futureDate.toISOString().split("T")[0] + "T00:00:00.000Z",
      time: "10:30am",
      note: "Special Budget Meeting",
    };

    fs.writeFileSync(GOVERNANCE_FILE, JSON.stringify(data, null, 2));

    // Need to wait for eleventy to rebuild - give it a moment
    await page.waitForTimeout(1000);

    await page.goto("/about/governance/");

    const meetingSection = page.locator(".sidebar-block").first();
    const dateTimeText = await meetingSection.locator("strong").first().textContent();

    // Should show the 15th of next month at 10:30 AM
    expect(dateTimeText).toContain("15");
    expect(dateTimeText).toContain("10:30 AM");

    // Should show the override note
    const noteElement = meetingSection.locator("em");
    await expect(noteElement).toBeVisible();
    const noteText = await noteElement.textContent();
    expect(noteText).toContain("Special Budget Meeting");
  });

  test("falls back to regular schedule when override is in the past", async ({ page }) => {
    const data = JSON.parse(fs.readFileSync(GOVERNANCE_FILE, "utf-8"));

    // Set override to a past date (should be ignored)
    data.next_meeting_override = {
      date: "1970-01-01T00:00:00.000Z",
      time: "2:30pm",
      note: "This should not appear",
    };

    fs.writeFileSync(GOVERNANCE_FILE, JSON.stringify(data, null, 2));
    await page.waitForTimeout(1000);

    await page.goto("/about/governance/");

    const meetingSection = page.locator(".sidebar-block").first();

    // Should NOT show the override note since date is in past
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
      date: "2030-01-20T00:00:00.000Z",
      time: "3:00pm",
      note: "Timezone test",
    };

    fs.writeFileSync(GOVERNANCE_FILE, JSON.stringify(data, null, 2));
    await page.waitForTimeout(1000);

    await page.goto("/about/governance/");

    const meetingSection = page.locator(".sidebar-block").first();
    const dateTimeText = await meetingSection.locator("strong").first().textContent();

    // Should show January 20, not January 19
    expect(dateTimeText).toContain("January 20");
    expect(dateTimeText).toContain("3:00 PM");
  });
});
