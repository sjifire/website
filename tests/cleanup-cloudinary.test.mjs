import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";

import {
  CLOUD_NAME,
  DEFAULT_MAX_AGE_DAYS,
  RESOURCE_TYPES,
  RATE_LIMIT_DELAY_MS,
  isOlderThan,
  formatDate,
  formatBytes,
} from "../scripts/cleanup-cloudinary.mjs";

describe("cleanup-cloudinary module", () => {
  describe("constants", () => {
    it("CLOUD_NAME is extracted from site config", () => {
      assert.strictEqual(CLOUD_NAME, "san-juan-fire-district-3");
    });

    it("DEFAULT_MAX_AGE_DAYS is 30", () => {
      assert.strictEqual(DEFAULT_MAX_AGE_DAYS, 30);
    });

    it("RESOURCE_TYPES includes fetch and upload", () => {
      assert.deepStrictEqual(RESOURCE_TYPES, ["fetch", "upload"]);
    });

    it("RATE_LIMIT_DELAY_MS is 200ms", () => {
      assert.strictEqual(RATE_LIMIT_DELAY_MS, 200);
    });
  });

  describe("isOlderThan", () => {
    it("returns true for dates older than maxAgeDays", () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      assert.strictEqual(isOlderThan(oldDate.toISOString(), 5), true);
    });

    it("returns false for dates newer than maxAgeDays", () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 2);
      assert.strictEqual(isOlderThan(recentDate.toISOString(), 5), false);
    });

    it("returns false for today with maxAgeDays=1", () => {
      const today = new Date();
      assert.strictEqual(isOlderThan(today.toISOString(), 1), false);
    });

    it("returns true for all dates when maxAgeDays=0", () => {
      const now = new Date();
      // Even dates from a millisecond ago are "older than 0 days"
      const slightlyOld = new Date(now.getTime() - 1);
      assert.strictEqual(isOlderThan(slightlyOld.toISOString(), 0), true);
    });

    it("handles date strings in various formats", () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 35);

      // ISO format
      assert.strictEqual(isOlderThan(thirtyDaysAgo.toISOString(), 30), true);

      // Date-only string
      const dateOnly = thirtyDaysAgo.toISOString().split("T")[0];
      assert.strictEqual(isOlderThan(dateOnly, 30), true);
    });

    it("returns true for exactly maxAgeDays boundary", () => {
      const exactBoundary = new Date();
      exactBoundary.setDate(exactBoundary.getDate() - 5);
      exactBoundary.setHours(0, 0, 0, 0);

      // At or before the cutoff should be considered stale
      assert.strictEqual(isOlderThan(exactBoundary.toISOString(), 5), true);
    });
  });

  describe("formatDate", () => {
    it("formats ISO date string to YYYY-MM-DD", () => {
      assert.strictEqual(formatDate("2026-01-15T10:30:00.000Z"), "2026-01-15");
    });

    it("handles date without time component", () => {
      assert.strictEqual(formatDate("2026-06-20"), "2026-06-20");
    });

    it("handles Date object converted to string", () => {
      const date = new Date("2026-03-25T15:45:00Z");
      assert.strictEqual(formatDate(date.toISOString()), "2026-03-25");
    });

    it("pads single-digit months and days", () => {
      assert.strictEqual(formatDate("2026-01-05T00:00:00Z"), "2026-01-05");
    });
  });

  describe("formatBytes", () => {
    it("formats bytes under 1KB", () => {
      assert.strictEqual(formatBytes(0), "0 B");
      assert.strictEqual(formatBytes(100), "100 B");
      assert.strictEqual(formatBytes(1023), "1023 B");
    });

    it("formats bytes as KB", () => {
      assert.strictEqual(formatBytes(1024), "1.0 KB");
      assert.strictEqual(formatBytes(1536), "1.5 KB");
      assert.strictEqual(formatBytes(10240), "10.0 KB");
      assert.strictEqual(formatBytes(512000), "500.0 KB");
    });

    it("formats bytes as MB", () => {
      assert.strictEqual(formatBytes(1024 * 1024), "1.00 MB");
      assert.strictEqual(formatBytes(1.5 * 1024 * 1024), "1.50 MB");
      assert.strictEqual(formatBytes(10 * 1024 * 1024), "10.00 MB");
      assert.strictEqual(formatBytes(123.45 * 1024 * 1024), "123.45 MB");
    });

    it("handles boundary values correctly", () => {
      // Just under 1KB
      assert.strictEqual(formatBytes(1023), "1023 B");
      // Exactly 1KB
      assert.strictEqual(formatBytes(1024), "1.0 KB");
      // Just under 1MB
      assert.strictEqual(formatBytes(1024 * 1024 - 1), "1024.0 KB");
      // Exactly 1MB
      assert.strictEqual(formatBytes(1024 * 1024), "1.00 MB");
    });

    it("handles large values", () => {
      // 1GB
      assert.strictEqual(formatBytes(1024 * 1024 * 1024), "1024.00 MB");
      // 500MB
      assert.strictEqual(formatBytes(500 * 1024 * 1024), "500.00 MB");
    });
  });
});
