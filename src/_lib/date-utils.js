const { DateTime } = require("luxon");

/**
 * Factory function to create date filters for Eleventy.
 * Handles both Date objects and ISO strings, always uses UTC to avoid DST issues.
 *
 * @param {Object|string} formatter - Either a Luxon format object for toLocaleString()
 *                                    or a format string for toFormat()
 * @returns {Function} A filter function that takes a date and returns a formatted string
 */
function createDateFilter(formatter) {
  return (dateObj) => {
    if (!dateObj) return;
    if (typeof dateObj.toISOString === "function") {
      dateObj = dateObj.toISOString();
    }
    const dt = DateTime.fromISO(dateObj, { zone: "utc" });
    return typeof formatter === "string"
      ? dt.toFormat(formatter)
      : dt.toLocaleString(formatter);
  };
}

/**
 * Calculate the next occurrence of a meeting based on week-of-month and day-of-week.
 * @param {number} weekOfMonth - 1=first, 2=second, 3=third, 4=fourth
 * @param {number} dayOfWeek - 0=Sunday, 1=Monday, 2=Tuesday, etc.
 * @param {string} time - Time in HH:mm format (24-hour)
 * @returns {DateTime} The next meeting date
 */
function getNextMeetingDate(weekOfMonth, dayOfWeek, time = "15:00") {
  const now = DateTime.now().setZone("America/Los_Angeles");
  const [hour, minute] = time.split(":").map(Number);

  // Try current month and next month
  for (let monthOffset = 0; monthOffset <= 1; monthOffset++) {
    const targetMonth = now.plus({ months: monthOffset });
    const firstOfMonth = targetMonth.startOf("month");

    // Calculate the Nth occurrence of the day in the month
    const firstDayWeekday = firstOfMonth.weekday % 7; // Convert to 0=Sunday
    let daysToAdd = dayOfWeek - firstDayWeekday;
    if (daysToAdd < 0) daysToAdd += 7;
    let meetingDate = firstOfMonth.plus({ days: daysToAdd + (weekOfMonth - 1) * 7 });

    // Set the time
    meetingDate = meetingDate.set({ hour, minute, second: 0, millisecond: 0 });

    // If meeting is in the future, return it
    if (meetingDate > now) {
      return meetingDate;
    }
  }

  // Fallback: return next month's meeting
  return now.plus({ months: 1 }).startOf("month");
}

// Pre-configured date filters
const dateFilters = {
  // "Jan 15" - short format without year
  postDateTerseNoYearISO: createDateFilter({ month: "short", day: "numeric" }),

  // "2024-01-15" - HTML datetime attribute format
  htmlDateStringISO: createDateFilter("yyyy-LL-dd"),

  // "Jan 15, 2024" - medium format with year
  postDateTerseISO: createDateFilter(DateTime.DATE_MED),

  // "Monday, January 15, 2024" - full verbose format
  postDateVerboseISO: createDateFilter(DateTime.DATE_HUGE),
};

module.exports = {
  createDateFilter,
  dateFilters,
  getNextMeetingDate,
  DateTime, // Re-export for use in tests
};
