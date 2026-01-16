const { DateTime } = require("luxon");

/**
 * Parse a time string in various formats (12-hour or 24-hour) to hour/minute
 * @param {string} timeStr - Time like "2:30pm", "14:30", "3:00 PM", etc.
 * @returns {{hour: number, minute: number}} Parsed hour and minute in 24-hour format
 */
function parseTimeString(timeStr) {
  if (!timeStr) return { hour: 15, minute: 0 }; // Default to 3:00 PM

  const normalized = timeStr.toLowerCase().trim();

  // Check for 12-hour format with am/pm
  const match12h = normalized.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  if (match12h) {
    let hour = parseInt(match12h[1], 10);
    const minute = parseInt(match12h[2], 10);
    const period = match12h[3];

    if (period === "pm" && hour !== 12) {
      hour += 12;
    } else if (period === "am" && hour === 12) {
      hour = 0;
    }

    return { hour, minute };
  }

  // Fallback: try simple colon split for 24-hour format
  const parts = normalized.split(":").map(p => parseInt(p, 10));
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { hour: parts[0], minute: parts[1] };
  }

  // Default fallback
  return { hour: 15, minute: 0 };
}

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
 * @param {string} timezone - IANA timezone string
 * @returns {DateTime} The next meeting date
 */
function getNextMeetingDate(weekOfMonth, dayOfWeek, time = "15:00", timezone) {
  const now = DateTime.now().setZone(timezone);
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

/**
 * Format a meeting date result object for template consumption
 * @param {DateTime} date - Luxon DateTime object
 * @param {boolean} isOverride - Whether this is an override date
 * @param {string|null} note - Optional note for the meeting
 * @returns {Object} Formatted meeting result
 */
function formatMeetingResult(date, isOverride = false, note = null) {
  return {
    date,
    formatted: date.toFormat("cccc, LLLL d, yyyy"),
    time: date.toFormat("h:mm a"),
    isOverride,
    note
  };
}

/**
 * Calculate next meeting with override support
 * @param {Object} schedule - Recurring schedule config (week_of_month, day_of_week, time)
 * @param {Object} override - Optional override (date, time, note)
 * @param {string} timezone - IANA timezone string
 * @returns {Object} Meeting result with date, formatted, time, isOverride, note
 */
function getNextMeeting(schedule, override, timezone) {
  // Check for override first (must be enabled and have a date)
  if (override?.enabled && override?.date) {
    // Parse date in UTC to extract year/month/day, then create in local timezone
    // This prevents timezone conversion from shifting the calendar date
    const utcDate = DateTime.fromISO(override.date, { zone: "utc" });
    let overrideDate = DateTime.fromObject(
      { year: utcDate.year, month: utcDate.month, day: utcDate.day },
      { zone: timezone }
    );
    if (override.time) {
      const { hour, minute } = parseTimeString(override.time);
      overrideDate = overrideDate.set({ hour, minute });
    }
    if (overrideDate > DateTime.now()) {
      return formatMeetingResult(overrideDate, true, override.note || null);
    }
  }

  // Calculate from recurring schedule (values may be strings from TinaCMS, parse as integers)
  const nextDate = getNextMeetingDate(
    parseInt(schedule.week_of_month, 10),
    parseInt(schedule.day_of_week, 10),
    schedule.time,
    timezone
  );
  return formatMeetingResult(nextDate);
}

/**
 * Format a meeting schedule as a human-readable string
 * @param {Object} schedule - Schedule config with week_of_month, day_of_week, time
 * @returns {string} e.g., "third Tuesday of every month at 3:00 PM"
 */
function formatMeetingSchedule(schedule) {
  const ordinals = ['', 'first', 'second', 'third', 'fourth', 'fifth'];
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const weekOfMonth = parseInt(schedule.week_of_month, 10);
  const dayOfWeek = parseInt(schedule.day_of_week, 10);
  const { hour, minute } = parseTimeString(schedule.time);

  const ordinal = ordinals[weekOfMonth] || `${weekOfMonth}th`;
  const dayName = days[dayOfWeek];

  // Format time in 12-hour format
  const hour12 = hour % 12 || 12;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const timeStr = minute === 0 ? `${hour12}:00 ${ampm}` : `${hour12}:${minute.toString().padStart(2, '0')} ${ampm}`;

  return `${ordinal} ${dayName} of every month at ${timeStr}`;
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
  getNextMeeting,
  formatMeetingResult,
  formatMeetingSchedule,
  parseTimeString,
  DateTime,
};
