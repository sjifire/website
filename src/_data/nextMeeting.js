const { DateTime, getNextMeetingDate } = require("../_lib/date-filters");
const yaml = require("js-yaml");
const fs = require("fs");
const path = require("path");

module.exports = function() {
  // Load governance data from YAML
  const governanceData = yaml.load(
    fs.readFileSync(path.join(__dirname, "governance.yml"), "utf8")
  );

  const schedule = governanceData.meeting_schedule;
  const override = governanceData.next_meeting_override;
  const location = governanceData.meeting_location;

  let nextMeetingDate;
  let isOverride = false;
  let overrideNote = null;

  // Check if there's an override with a date set
  if (override && override.date) {
    const overrideDateTime = DateTime.fromISO(override.date, { zone: "America/Los_Angeles" });
    const [hour, minute] = (override.time || schedule.time).split(":").map(Number);
    nextMeetingDate = overrideDateTime.set({ hour, minute });
    isOverride = true;
    overrideNote = override.note || null;
  } else {
    // Calculate based on recurring schedule
    nextMeetingDate = getNextMeetingDate(
      schedule.week_of_month,
      schedule.day_of_week,
      schedule.time
    );
  }

  // Format the time for display
  const timeFormatted = nextMeetingDate.toFormat("h:mm a");
  const dateFormatted = nextMeetingDate.toFormat("cccc, LLLL d, yyyy");
  const dateShort = nextMeetingDate.toFormat("LLLL d");

  return {
    date: nextMeetingDate.toISO(),
    dateFormatted,
    dateShort,
    timeFormatted,
    isOverride,
    overrideNote,
    location: {
      name: location.name,
      street: location.street,
      city: location.city,
      state: location.state,
      zip: location.zip,
      fullAddress: `${location.street}, ${location.city}, ${location.state} ${location.zip}`
    },
    schedule: {
      description: schedule.description
    }
  };
};
