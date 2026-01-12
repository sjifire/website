const { describe, it } = require("node:test");
const assert = require("node:assert");
const { createDateFilter, dateFilters, getNextMeetingDate, getNextMeeting, parseTimeString, DateTime } = require("../src/_lib/date-utils");

const TEST_TIMEZONE = "America/Los_Angeles";

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

describe("getNextMeetingDate", () => {
  describe("basic functionality", () => {
    it("returns a DateTime object", () => {
      const result = getNextMeetingDate(2, 2, "15:00", TEST_TIMEZONE);
      assert.ok(result instanceof DateTime, "Should return a Luxon DateTime");
    });

    it("returns a date in the future", () => {
      const result = getNextMeetingDate(2, 2, "15:00", TEST_TIMEZONE);
      const now = DateTime.now();
      assert.ok(result > now, "Meeting date should be in the future");
    });

    it("sets the correct time", () => {
      const result = getNextMeetingDate(2, 2, "15:00", TEST_TIMEZONE);
      assert.strictEqual(result.hour, 15, "Hour should be 15");
      assert.strictEqual(result.minute, 0, "Minute should be 0");
    });

    it("sets different time correctly", () => {
      const result = getNextMeetingDate(2, 2, "09:30", TEST_TIMEZONE);
      assert.strictEqual(result.hour, 9, "Hour should be 9");
      assert.strictEqual(result.minute, 30, "Minute should be 30");
    });
  });

  describe("week of month calculation", () => {
    it("calculates first week correctly (week_of_month=1)", () => {
      const result = getNextMeetingDate(1, 2, "15:00", TEST_TIMEZONE); // First Tuesday
      // The result should be a Tuesday (weekday 2 in Luxon, but we use 0-indexed Sunday)
      // Luxon uses 1=Monday, 2=Tuesday, etc.
      assert.strictEqual(result.weekday, 2, "Should be a Tuesday");
      assert.ok(result.day <= 7, "First week should be day 1-7");
    });

    it("calculates second week correctly (week_of_month=2)", () => {
      const result = getNextMeetingDate(2, 2, "15:00", TEST_TIMEZONE); // Second Tuesday
      assert.strictEqual(result.weekday, 2, "Should be a Tuesday");
      assert.ok(result.day >= 8 && result.day <= 14, "Second week should be day 8-14");
    });

    it("calculates third week correctly (week_of_month=3)", () => {
      const result = getNextMeetingDate(3, 2, "15:00", TEST_TIMEZONE); // Third Tuesday
      assert.strictEqual(result.weekday, 2, "Should be a Tuesday");
      assert.ok(result.day >= 15 && result.day <= 21, "Third week should be day 15-21");
    });

    it("calculates fourth week correctly (week_of_month=4)", () => {
      const result = getNextMeetingDate(4, 2, "15:00", TEST_TIMEZONE); // Fourth Tuesday
      assert.strictEqual(result.weekday, 2, "Should be a Tuesday");
      assert.ok(result.day >= 22 && result.day <= 28, "Fourth week should be day 22-28");
    });
  });

  describe("day of week calculation", () => {
    it("calculates Sunday correctly (day_of_week=0)", () => {
      const result = getNextMeetingDate(2, 0, "15:00", TEST_TIMEZONE);
      assert.strictEqual(result.weekday, 7, "Should be Sunday (Luxon weekday 7)");
    });

    it("calculates Monday correctly (day_of_week=1)", () => {
      const result = getNextMeetingDate(2, 1, "15:00", TEST_TIMEZONE);
      assert.strictEqual(result.weekday, 1, "Should be Monday");
    });

    it("calculates Tuesday correctly (day_of_week=2)", () => {
      const result = getNextMeetingDate(2, 2, "15:00", TEST_TIMEZONE);
      assert.strictEqual(result.weekday, 2, "Should be Tuesday");
    });

    it("calculates Wednesday correctly (day_of_week=3)", () => {
      const result = getNextMeetingDate(2, 3, "15:00", TEST_TIMEZONE);
      assert.strictEqual(result.weekday, 3, "Should be Wednesday");
    });

    it("calculates Thursday correctly (day_of_week=4)", () => {
      const result = getNextMeetingDate(2, 4, "15:00", TEST_TIMEZONE);
      assert.strictEqual(result.weekday, 4, "Should be Thursday");
    });

    it("calculates Friday correctly (day_of_week=5)", () => {
      const result = getNextMeetingDate(2, 5, "15:00", TEST_TIMEZONE);
      assert.strictEqual(result.weekday, 5, "Should be Friday");
    });

    it("calculates Saturday correctly (day_of_week=6)", () => {
      const result = getNextMeetingDate(2, 6, "15:00", TEST_TIMEZONE);
      assert.strictEqual(result.weekday, 6, "Should be Saturday");
    });
  });

  describe("timezone handling", () => {
    it("uses the provided timezone", () => {
      const result = getNextMeetingDate(2, 2, "15:00", TEST_TIMEZONE);
      assert.strictEqual(result.zoneName, TEST_TIMEZONE, "Should use the provided timezone");
    });
  });
});

describe("parseTimeString", () => {
  describe("12-hour format with am/pm", () => {
    it("parses time with lowercase pm", () => {
      const result = parseTimeString("2:30pm");
      assert.strictEqual(result.hour, 14, "Hour should be 14 (2pm)");
      assert.strictEqual(result.minute, 30, "Minute should be 30");
    });

    it("parses time with lowercase am", () => {
      const result = parseTimeString("9:15am");
      assert.strictEqual(result.hour, 9, "Hour should be 9");
      assert.strictEqual(result.minute, 15, "Minute should be 15");
    });

    it("parses time with uppercase PM", () => {
      const result = parseTimeString("3:00 PM");
      assert.strictEqual(result.hour, 15, "Hour should be 15 (3pm)");
      assert.strictEqual(result.minute, 0, "Minute should be 0");
    });

    it("parses time with uppercase AM", () => {
      const result = parseTimeString("10:45 AM");
      assert.strictEqual(result.hour, 10, "Hour should be 10");
      assert.strictEqual(result.minute, 45, "Minute should be 45");
    });

    it("handles 12:00pm as noon (12)", () => {
      const result = parseTimeString("12:00pm");
      assert.strictEqual(result.hour, 12, "Hour should be 12 (noon)");
      assert.strictEqual(result.minute, 0, "Minute should be 0");
    });

    it("handles 12:00am as midnight (0)", () => {
      const result = parseTimeString("12:00am");
      assert.strictEqual(result.hour, 0, "Hour should be 0 (midnight)");
      assert.strictEqual(result.minute, 0, "Minute should be 0");
    });

    it("handles 12:30pm correctly", () => {
      const result = parseTimeString("12:30pm");
      assert.strictEqual(result.hour, 12, "Hour should be 12");
      assert.strictEqual(result.minute, 30, "Minute should be 30");
    });

    it("handles 12:30am correctly", () => {
      const result = parseTimeString("12:30am");
      assert.strictEqual(result.hour, 0, "Hour should be 0");
      assert.strictEqual(result.minute, 30, "Minute should be 30");
    });
  });

  describe("24-hour format", () => {
    it("parses 24-hour time", () => {
      const result = parseTimeString("14:30");
      assert.strictEqual(result.hour, 14, "Hour should be 14");
      assert.strictEqual(result.minute, 30, "Minute should be 30");
    });

    it("parses midnight in 24-hour format", () => {
      const result = parseTimeString("00:00");
      assert.strictEqual(result.hour, 0, "Hour should be 0");
      assert.strictEqual(result.minute, 0, "Minute should be 0");
    });

    it("parses 23:59", () => {
      const result = parseTimeString("23:59");
      assert.strictEqual(result.hour, 23, "Hour should be 23");
      assert.strictEqual(result.minute, 59, "Minute should be 59");
    });
  });

  describe("edge cases", () => {
    it("returns default time for null input", () => {
      const result = parseTimeString(null);
      assert.strictEqual(result.hour, 15, "Default hour should be 15");
      assert.strictEqual(result.minute, 0, "Default minute should be 0");
    });

    it("returns default time for undefined input", () => {
      const result = parseTimeString(undefined);
      assert.strictEqual(result.hour, 15, "Default hour should be 15");
      assert.strictEqual(result.minute, 0, "Default minute should be 0");
    });

    it("returns default time for empty string", () => {
      const result = parseTimeString("");
      assert.strictEqual(result.hour, 15, "Default hour should be 15");
      assert.strictEqual(result.minute, 0, "Default minute should be 0");
    });

    it("handles extra whitespace", () => {
      const result = parseTimeString("  2:30pm  ");
      assert.strictEqual(result.hour, 14, "Hour should be 14");
      assert.strictEqual(result.minute, 30, "Minute should be 30");
    });
  });
});

describe("getNextMeeting", () => {
  const schedule = {
    week_of_month: 2,
    day_of_week: 2,
    time: "15:00"
  };

  describe("returns correct structure", () => {
    it("returns an object with required properties", () => {
      const result = getNextMeeting(schedule, null, TEST_TIMEZONE);
      assert.ok(result.date, "Should have date property");
      assert.ok(result.formatted, "Should have formatted property");
      assert.ok(result.time, "Should have time property");
      assert.strictEqual(typeof result.isOverride, "boolean", "isOverride should be boolean");
    });

    it("returns isOverride=false for regular schedule", () => {
      const result = getNextMeeting(schedule, null, TEST_TIMEZONE);
      assert.strictEqual(result.isOverride, false, "isOverride should be false");
      assert.strictEqual(result.note, null, "note should be null");
    });
  });

  describe("override handling", () => {
    it("uses override when date is in the future", () => {
      const futureDate = DateTime.now().plus({ days: 7 }).toISO();
      const override = {
        date: futureDate,
        time: "14:00",
        note: "Special meeting"
      };
      const result = getNextMeeting(schedule, override, TEST_TIMEZONE);
      assert.strictEqual(result.isOverride, true, "isOverride should be true");
      assert.strictEqual(result.note, "Special meeting", "note should be set");
    });

    it("ignores override when date is in the past", () => {
      const pastOverride = {
        date: "1970-01-01T00:00:00.000Z",
        time: "2:30pm",
        note: "Past meeting"
      };
      const result = getNextMeeting(schedule, pastOverride, TEST_TIMEZONE);
      assert.strictEqual(result.isOverride, false, "isOverride should be false for past dates");
      assert.strictEqual(result.note, null, "note should be null");
    });

    it("handles override with 12-hour time format", () => {
      const futureDate = DateTime.now().plus({ days: 7 }).toISO();
      const override = {
        date: futureDate,
        time: "2:30pm",
        note: "Afternoon meeting"
      };
      const result = getNextMeeting(schedule, override, TEST_TIMEZONE);
      assert.strictEqual(result.isOverride, true, "isOverride should be true");
      assert.ok(result.time.includes("2:30"), `Time should contain "2:30", got "${result.time}"`);
    });

    it("handles override without time (uses date only)", () => {
      const futureDate = DateTime.now().plus({ days: 7 }).startOf("day").toISO();
      const override = {
        date: futureDate,
        note: "No time specified"
      };
      const result = getNextMeeting(schedule, override, TEST_TIMEZONE);
      assert.strictEqual(result.isOverride, true, "isOverride should be true");
    });

    it("handles null override", () => {
      const result = getNextMeeting(schedule, null, TEST_TIMEZONE);
      assert.strictEqual(result.isOverride, false, "isOverride should be false");
    });

    it("handles undefined override", () => {
      const result = getNextMeeting(schedule, undefined, TEST_TIMEZONE);
      assert.strictEqual(result.isOverride, false, "isOverride should be false");
    });

    it("handles override with empty date", () => {
      const override = {
        date: "",
        time: "2:30pm"
      };
      const result = getNextMeeting(schedule, override, TEST_TIMEZONE);
      assert.strictEqual(result.isOverride, false, "isOverride should be false for empty date");
    });
  });

  describe("schedule parsing", () => {
    it("handles string values from TinaCMS", () => {
      const stringSchedule = {
        week_of_month: "2",
        day_of_week: "2",
        time: "15:00"
      };
      const result = getNextMeeting(stringSchedule, null, TEST_TIMEZONE);
      assert.ok(result.date, "Should parse string schedule values");
      assert.strictEqual(result.date.weekday, 2, "Should be Tuesday");
    });
  });
});
