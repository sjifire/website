const { describe, it } = require("node:test");
const assert = require("node:assert");
const { createDateFilter, dateFilters, DateTime } = require("../src/_lib/date-filters");

describe("createDateFilter", () => {
  describe("input handling", () => {
    it("returns undefined for null input", () => {
      const filter = createDateFilter(DateTime.DATE_MED);
      assert.strictEqual(filter(null), undefined);
    });

    it("returns undefined for undefined input", () => {
      const filter = createDateFilter(DateTime.DATE_MED);
      assert.strictEqual(filter(undefined), undefined);
    });

    it("handles ISO string input", () => {
      const filter = createDateFilter("yyyy-LL-dd");
      assert.strictEqual(filter("2024-06-15T12:00:00.000Z"), "2024-06-15");
    });

    it("handles Date object input", () => {
      const filter = createDateFilter("yyyy-LL-dd");
      const date = new Date("2024-06-15T12:00:00.000Z");
      assert.strictEqual(filter(date), "2024-06-15");
    });

    it("handles ISO string without time", () => {
      const filter = createDateFilter("yyyy-LL-dd");
      assert.strictEqual(filter("2024-06-15"), "2024-06-15");
    });
  });

  describe("UTC timezone handling", () => {
    it("uses UTC to avoid DST issues", () => {
      const filter = createDateFilter("yyyy-LL-dd HH:mm");
      // This date is during DST in many timezones
      assert.strictEqual(filter("2024-06-15T00:00:00.000Z"), "2024-06-15 00:00");
    });

    it("handles midnight UTC correctly", () => {
      const filter = createDateFilter("yyyy-LL-dd");
      assert.strictEqual(filter("2024-01-01T00:00:00.000Z"), "2024-01-01");
    });
  });

  describe("format types", () => {
    it("supports format string (toFormat)", () => {
      const filter = createDateFilter("yyyy-LL-dd");
      assert.strictEqual(filter("2024-06-15T12:00:00.000Z"), "2024-06-15");
    });

    it("supports format object (toLocaleString)", () => {
      const filter = createDateFilter({ month: "short", day: "numeric" });
      const result = filter("2024-06-15T12:00:00.000Z");
      // Result should contain "Jun" and "15"
      assert.ok(result.includes("Jun"), `Expected "Jun" in "${result}"`);
      assert.ok(result.includes("15"), `Expected "15" in "${result}"`);
    });

    it("supports DateTime preset formats", () => {
      const filter = createDateFilter(DateTime.DATE_MED);
      const result = filter("2024-06-15T12:00:00.000Z");
      // DATE_MED format: "Jun 15, 2024"
      assert.ok(result.includes("Jun"), `Expected "Jun" in "${result}"`);
      assert.ok(result.includes("15"), `Expected "15" in "${result}"`);
      assert.ok(result.includes("2024"), `Expected "2024" in "${result}"`);
    });
  });
});

describe("dateFilters", () => {
  const testDate = "2024-11-25T15:30:00.000Z";

  describe("postDateTerseNoYearISO", () => {
    it("formats as short month and day without year", () => {
      const result = dateFilters.postDateTerseNoYearISO(testDate);
      assert.ok(result.includes("Nov"), `Expected "Nov" in "${result}"`);
      assert.ok(result.includes("25"), `Expected "25" in "${result}"`);
      assert.ok(!result.includes("2024"), `Should not contain year in "${result}"`);
    });
  });

  describe("htmlDateStringISO", () => {
    it("formats as yyyy-LL-dd for HTML datetime attributes", () => {
      const result = dateFilters.htmlDateStringISO(testDate);
      assert.strictEqual(result, "2024-11-25");
    });

    it("produces valid ISO date format", () => {
      const result = dateFilters.htmlDateStringISO(testDate);
      assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("postDateTerseISO", () => {
    it("formats with month, day, and year", () => {
      const result = dateFilters.postDateTerseISO(testDate);
      assert.ok(result.includes("Nov"), `Expected "Nov" in "${result}"`);
      assert.ok(result.includes("25"), `Expected "25" in "${result}"`);
      assert.ok(result.includes("2024"), `Expected "2024" in "${result}"`);
    });
  });

  describe("postDateVerboseISO", () => {
    it("formats with full day name and month", () => {
      const result = dateFilters.postDateVerboseISO(testDate);
      // DATE_HUGE: "Monday, November 25, 2024"
      assert.ok(result.includes("Monday"), `Expected "Monday" in "${result}"`);
      assert.ok(result.includes("November"), `Expected "November" in "${result}"`);
      assert.ok(result.includes("25"), `Expected "25" in "${result}"`);
      assert.ok(result.includes("2024"), `Expected "2024" in "${result}"`);
    });
  });
});

describe("edge cases", () => {
  it("handles leap year dates", () => {
    const filter = createDateFilter("yyyy-LL-dd");
    assert.strictEqual(filter("2024-02-29T12:00:00.000Z"), "2024-02-29");
  });

  it("handles year boundaries", () => {
    const filter = createDateFilter("yyyy-LL-dd");
    assert.strictEqual(filter("2024-12-31T23:59:59.999Z"), "2024-12-31");
    assert.strictEqual(filter("2025-01-01T00:00:00.000Z"), "2025-01-01");
  });

  it("handles dates far in the past", () => {
    const filter = createDateFilter("yyyy-LL-dd");
    assert.strictEqual(filter("1999-12-31T12:00:00.000Z"), "1999-12-31");
  });

  it("handles dates in the future", () => {
    const filter = createDateFilter("yyyy-LL-dd");
    assert.strictEqual(filter("2030-06-15T12:00:00.000Z"), "2030-06-15");
  });
});
