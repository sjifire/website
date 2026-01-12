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
  DateTime, // Re-export for use in tests
};
