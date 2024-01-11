"use strict";
/**
 * MODULE:
 * Helper methods to retrieve and process an ESO report
 * into a stats JSON file.
 *
 *
 * WARNINGS:
 *  - This module is tightly coupled with the needs
 *    of SJIF&R, such as the stats computed from
 *    the raw data.
 *  - this is tightly coupled to the report columns requiring
 *    at least one incident per row, but expecting multiple
 *    columns per incident for each responder on each apparatus
 *  - tightly coupled to quirks of SJIF&R, such as
 *    zones (south, north, central)
 * TODO/QUESTIONS:
 *  - should backfill be counted in general?
 *  - should backfill be counted on a first-unit response?
 *
 */
const fs = require("fs");
const _ = require("lodash");
const logger = require("./logger");

// logger.level = 'debug'
process.env.TZ = "UTC";

const DEFAULT_DETAILED_STATS_DAY_RANGE = 30;

const SOUTH_STATIONS = ["32", "33"];
const CENTRAL_STATIONS = ["31", "36"];
const NORTH_STATIONS = ["34", "35"];

const MEDICAL_TYPES = ["3"]; // Medical & Rescue
const FIRE_TYPE = ["1", "4", "5"]; // fire, hazard, backfill
const CANCELLED_TYPES = ["61"];
const DOWNGRADE_TYPES = ["6", "7"];
const BACKFILL_TYPES = ["571"];

// const DAYTIME_RANGE = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]
const NIGHTTIME_RANGE = [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5];

const ESO_TIMEOUT = 600000; // the report can take a LONG time to generate;
const ESO_LOGIN_URL = "https://www.esosuite.net/login";

/**
 * Retrieves a predefined CSV report from ESO.  See README.md for details
 * @param  {[String]}  username ESO username to log in
 * @param  {[String]}  password ESO password to log in
 * @param  {[String]}  agency ESO agency to log in
 * @param  {[String]}  reportName the pre-defined ESO report
 * @param  {[Boolean]} headless whether to run in headless mode or not.
 * @return {[String]}  local filepath of temp csv file
 */
const retrieveCSVReport = async function (
  username,
  password,
  agency,
  reportName,
  headless,
) {
  const os = require("os");
  const path = require("path");
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chromium"));

  const { chromium } = require("playwright");
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: headless,
    acceptDownloads: true,
  });
  const page = await context.newPage();
  await page.goto(ESO_LOGIN_URL);

  // Interact with login form
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="agency"]', agency);
  await page.click('button[type="submit"].login-button');

  // go to ad-hoc reporting engine and run report
  await page.click("text=Ad-Hoc");
  const [reportPage] = await Promise.all([
    context.waitForEvent("page"),
    page.click("text=" + reportName), // ad-hoc opens a new tab; we need to go find it
  ]);

  // wait for report to finish displaying
  await reportPage.waitForLoadState("networkidle", { timeout: ESO_TIMEOUT });
  // download CSV of the report.
  const [download] = await Promise.all([
    // Start waiting for the download
    reportPage.waitForEvent("download", { timeout: ESO_TIMEOUT }),
    // Perform the action that initiates download
    reportPage.click("#CSV", { timeout: ESO_TIMEOUT }),
  ]);
  const csvPath = await download.path();
  context.close();
  return csvPath;
};

/**
 * Given a local filepath to a CSV file, parse, sort, and do some record cleanup
 * @param  {[String]}  local filepath to a CSV file.
 *                     Must be UTF8 encoded
 * @return {[Array of Objects]} Each row is an object, with the array
 *                              sorted by Dispatch Date
 */
const parseCSV = function (csvPath) {
  const content = fs.readFileSync(csvPath, "utf8");
  const { parse } = require("csv-parse/sync");
  const records = parse(content, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    cast: true,
    cast_date: true,
    trim: true,
  });

  // cleanup record oddities
  records.forEach((record) => {
    Object.keys(record).forEach((key) => {
      if (key.toLocaleLowerCase().endsWith(" date") && record[key] === "") {
        record[key] = null;
      }
    });
  });
  // sort by early to latest; and sort by the time dispatch pages us, NOT when
  // dispatch received the call as they don't always page in the same order
  // UPDATE: dispatch date is NOT always set; this occurs for calls which
  // are entered but not through dispatch, like controlled burns.
  return _.sortBy(records, "Alarm Date");
};

/**
 * process records to generate statistics
 * @param  {[Array of Objects]} expecting an array of sorted objects, each object
 *                              representing a row from the ESO csv report
 * @return {[Object]} a large nested object of statistics.
 */
const generateStats = ({
  records,
  startDate,
  stopDate,
  dayRange = DEFAULT_DETAILED_STATS_DAY_RANGE,
} = {}) => {
  const rawValues = _processRecords(records, startDate, stopDate, dayRange);
  return _createStats(rawValues);
};

/**
 * Private helper methods
 */
const _processRecords = function (records, startDate, stopDate, dayRange) {
  // stats for the day range from most recent record:
  // CLONE THE DATE before we modify it!
  if (startDate) {
    startDate = new Date(startDate); // copy date so we can modify OR parse if it comes in as a string
    if (!stopDate) {
      stopDate = _addDays(startDate, dayRange - 1); // we change it to be the very end of day, so this works out
    } else {
      stopDate = new Date(stopDate); // copy date so we can modify OR parse if it comes in as a string
      dayRange = Math.round(
        (stopDate.getTime() - startDate.getTime()) / 1000 / 60 / 60 / 24,
      );
    }
  }
  var firstRecord = _.first(records);
  var lastRecord = _.last(records);
  var firstRecordDate =
    firstRecord["Dispatched Date"] || firstRecord["Alarm Date"];
  var lastRecordDate =
    lastRecord["Dispatched Date"] || lastRecord["Alarm Date"];
  if (!stopDate) stopDate = lastRecordDate.getTime();

  stopDate = new Date(stopDate); // copy date so we can modify OR parse if it comes in as a string
  stopDate.setUTCHours(23, 59, 59, 999); // set to the very end of day
  // NOTE: this date range makes it exclusive, NOT inclusive...
  // so if 30 days, it would go from 12/25/21 23:59:59 back to 11/26/21 00:00:00
  if (!startDate) {
    startDate = _addDays(stopDate, -dayRange);
    startDate = _addDays(startDate, 1);
  }
  startDate.setHours(0, 0, 0, 0);
  if (stopDate < startDate) {
    throw new Error("Start Date cannot be after stop date");
  }
  const recordsInRange = records.filter(
    (record) =>
      record["Alarm Date"] >= startDate && record["Alarm Date"] <= stopDate,
  );
  // the groupBy sorts by lexographical ordering of the Incident Number; this isn't
  // always entered in correctly nor is the order of the incident the same order
  // as when pages go out.  SO we list the incidents by dispatch date order,
  // yet use the groupBy to then process those records within each incident
  const incidentsInDispatchedDateOrder = _.uniq(
    _.map(recordsInRange, "Incident Number"),
  );
  const byIncidentInRange = _.groupBy(recordsInRange, "Incident Number");

  const rawValues = {
    incident_ids: [],
    calls_per_day: {},
    reaction_times: [],
    travel_times: [],
    to_scene_times: [],
    on_scene_times: [],
    incident_times: [],
    personnel: [],
    personnel_times: [],
    apparatus: [],
    call_regions: [],
    incident_types: [],
    overlapping_calls_num: 0,
    daytime_calls: 0,
    nighttime_calls: 0,
    in_range_calls: _.size(byIncidentInRange),
    total_calls: _.uniqBy(records, "Incident Number").length,
    date_range_all_from: firstRecordDate,
    date_range_all_to: lastRecordDate,
    date_range_from: startDate,
    date_range_to: stopDate,
    parseWarnings: 0,
  };
  // loop for every day in the detailed range and set it up with zero.
  // this way we log the days that have no activit.
  // eslint-disable-next-line
  for (
    let day = new Date(startDate.getTime());
    day <= stopDate;
    day.setDate(day.getDate() + 1)
  ) {
    rawValues.calls_per_day[day.toLocaleDateString()] = 0;
  }

  let prevCallEnd = null;
  let inOverlappingCalls = false;
  incidentsInDispatchedDateOrder.forEach((incidentID) => {
    rawValues.incident_ids.push(incidentID);
    const incidentRecords = byIncidentInRange[incidentID];
    // baseRecord is used for all columns that are the same within the incidentID grouping
    const baseRecord = incidentRecords[0];

    const dispatchedDate =
      baseRecord["Dispatched Date"] || baseRecord["Alarm Date"];
    const incidentTypeCall = baseRecord["Incident Type Code"].toString();
    rawValues.calls_per_day[dispatchedDate.toLocaleDateString()]++;

    // lets check some times
    if (dispatchedDate - baseRecord["Alarm Date"] <= 2) {
      logger.verbose(`${incidentID} has incorrect Alarm & Dispatch times`);
      // this one doesn't matter; it should probably be fixed in training, but from
      // a report perspective, if these two are the same it is ok.
      // the alarm date should be when dispatch triggers a record
      // and the dispatch date is when they tone out.  Hence why we don't flag it as a warning
      //   rawValues.parseWarnings++
    }
    if (
      incidentTypeCall === "571" &&
      (_.isDate(baseRecord["En Route Date"]) ||
        _.isDate(baseRecord["Arrival Date"]))
    )
      logger.verbose(
        `${incidentID} is a standby yet has en route or arrival dates set`,
      );

    if (prevCallEnd && prevCallEnd > dispatchedDate) {
      if (!BACKFILL_TYPES.some((v) => incidentTypeCall.startsWith(v))) {
        rawValues.overlapping_calls_num += 1;
        if (!inOverlappingCalls) {
          // we didn't catch the first call that overlaps this one;
          // lets make sure it is counted!
          rawValues.overlapping_calls_num += 1;
          inOverlappingCalls = true;
        }
      }
    } else {
      inOverlappingCalls = false;
    }
    prevCallEnd = baseRecord["Last Unit Cleared Date"];

    if (NIGHTTIME_RANGE.includes(dispatchedDate.getHours())) {
      rawValues.nighttime_calls += 1;
    } else {
      rawValues.daytime_calls += 1;
    }
    const incidentUnitRecords = _.chain(incidentRecords)
      .map((r) => _.omit(r, "User Login ID"))
      .filter((r, loc, allRecords) =>
        loc === 0 ? true : !_.isEqual(r, allRecords[loc - 1]),
      )
      .value();
    // COMPUTE times based upon the Unit/Apparatus time, NOT each individual time
    const firstEnRouteUnit = _findFirst(
      incidentUnitRecords,
      "Dispatched Date",
      "En Route Date",
    );
    let reactionTime =
      (firstEnRouteUnit["En Route Date"] - dispatchedDate) / 1000;
    if (_.isNaN(reactionTime)) reactionTime = null;
    // const firstArrivedUnit = _findFirst(incidentUnitRecords, 'Arrival Date')
    const travelTimes = _extractTimes(
      incidentUnitRecords,
      "En Route Date",
      "Arrival Date",
    );
    const toSceneTimes = _extractTimes(
      incidentUnitRecords,
      "Dispatched Date",
      "Arrival Date",
    );
    // let onSceneTime   = (baseRecord['Last Unit Cleared Date'] - firstArrivedUnit['Arrival Date'])/1000;
    const onSceneTimes = _extractTimes(
      incidentUnitRecords,
      "Arrival Date",
      "Clear Date",
    );
    if (_.isEmpty(_.compact(travelTimes))) {
      logger.debug(`${incidentID} has empty travel times`);
      // travelTimes      = null;
      // toSceneTimes     = null
      // firstArrivedUnit = null;
      // onSceneTimes     = null;
    }
    if (_.isEmpty(_.compact(onSceneTimes))) {
      logger.debug(`${incidentID} has empty on-scene times`);
      rawValues.parseWarnings++;
    }

    const incidentTime =
      (baseRecord["Last Unit Cleared Date"] - dispatchedDate) / 1000;
    if (_.isNull(reactionTime)) {
      logger.verbose(`${incidentID} has no reaction time`);
      rawValues.parseWarnings++;
    }
    logger.verbose(
      `${incidentID}: reaction: ${reactionTime}; travel: ${travelTimes}; toScene: ${toSceneTimes}; onScene: ${onSceneTimes}; incidentTime: ${incidentTime}`,
    );
    rawValues.reaction_times.push(reactionTime);
    rawValues.travel_times.push(travelTimes);
    rawValues.to_scene_times.push(toSceneTimes);
    rawValues.on_scene_times.push(onSceneTimes);
    rawValues.incident_times.push(incidentTime);

    let personnelTimes = _.map(
      incidentRecords,
      (v) => (v["Clear Date"] - v["Dispatched Date"]) / 1000,
    );
    let personnel = _.map(incidentRecords, (v) => v["User Login ID"]);
    const uniqPersonnel = _.uniq(personnel);
    if (uniqPersonnel.length !== personnel.length) {
      // we have duplicate entries; this can happen if a rig is
      // assigned and a user hops into a different rig (e.g. FB)
      // while the first rig is cleared..
      // ACTION: remove dup users; use the longest time that they have
      //   1) remove all duplicate names and times
      //   2) find the locatin of the max time for that person
      //   3) insert one name and max time back into respective arrays
      _.each(uniqPersonnel, (p) => {
        let fromIndex = -1;
        const foundIndexes = [];
        while (
          (fromIndex = _.findIndex(personnel, _.matches(p), fromIndex + 1)) > -1
        ) {
          foundIndexes.push(fromIndex);
        }
        if (foundIndexes.length <= 1) return; // no DUPS!  continue to next
        const removedPersonnel = [];
        const removedTimes = [];
        _.each(foundIndexes, (i) => {
          // we can't delete/splice because then the indexing will be messed up.
          removedPersonnel.push(personnel[i]);
          personnel[i] = null;
          removedTimes.push(personnelTimes[i]);
          personnelTimes[i] = null;
        });
        personnel.push(removedPersonnel[0]);
        // lets find the earliest they were on scene, and the latest they left
        // and use that range.
        // vs find the largest time; sometimes a user will pop to a different
        // unit and be in two units for the duratin (which is incorrect); and sometimes
        // they will be in multiple units in a serial manner (go get one apparatus, return, get a different one, etc)
        const personnelRecords = _.filter(
          incidentRecords,
          (v) => v["User Login ID"] === p,
        );
        const earliestDispatchDate = _.sortBy(
          personnelRecords,
          "Dispatched Date",
        )[0]["Dispatched Date"];
        const latestClearDate = _.reverse(
          _.sortBy(personnelRecords, "Clear Date"),
        )[0]["Clear Date"];
        const newPersonnelTime =
          (latestClearDate - earliestDispatchDate) / 1000;
        personnelTimes.push(newPersonnelTime);
        // use earliest to latest and NOT the largest pre-computed time
        // personnelTimes.push(_.max(removedTimes));

        // do a bit of cleanup!  we need to remove the nulled values because the
        // length is used to for various counts
        personnel = _.compact(personnel);
        personnelTimes = _.compact(personnelTimes);
      });
    }

    let apparatus = _.map(incidentRecords, function (v) {
      return v["Apparatus Name"];
    });
    apparatus = _.uniq(apparatus);
    rawValues.personnel_times.push(personnelTimes);
    rawValues.personnel.push(personnel);
    rawValues.apparatus.push(apparatus);

    if (SOUTH_STATIONS.some((v) => baseRecord.Station.includes(v))) {
      rawValues.call_regions.push("south");
    } else if (NORTH_STATIONS.some((v) => baseRecord.Station.includes(v))) {
      rawValues.call_regions.push("north");
    } else if (CENTRAL_STATIONS.some((v) => baseRecord.Station.includes(v))) {
      rawValues.call_regions.push("central");
    } else {
      rawValues.call_regions.push("other"); // TODO: in district or out of district?
    }

    // NOTE: order matters; cancelled type is very specific, while downgrade is broad
    if (MEDICAL_TYPES.some((v) => incidentTypeCall.startsWith(v))) {
      rawValues.incident_types.push("medical_rescue");
    } else if (FIRE_TYPE.some((v) => incidentTypeCall.startsWith(v))) {
      rawValues.incident_types.push("fire");
    } else if (CANCELLED_TYPES.some((v) => incidentTypeCall.startsWith(v))) {
      rawValues.incident_types.push("cancelled");
    } else if (DOWNGRADE_TYPES.some((v) => incidentTypeCall.startsWith(v))) {
      rawValues.incident_types.push("downgraded");
    } else {
      rawValues.incident_types.push("other"); // TODO: in district or out of district?
    }
  });
  if (rawValues.incident_ids.length !== incidentsInDispatchedDateOrder.length) {
    logger.warn(
      `mismatch on incident counters: ${rawValues.incident_ids.length} (incident_ids) vs ${incidentsInDispatchedDateOrder.length} (incidentArr)`,
    );
  }
  logger.debug("_processRecords", rawValues);
  return rawValues;
};

const _createStats = function (rawValues) {
  const callsPerDay = _.values(rawValues.calls_per_day);
  const incidentTimes = _.chain(rawValues.incident_times)
    .flatten()
    .compact()
    .value();
  const statsOutput = {
    updated_at: new Date(),
    date_range_all_from: rawValues.date_range_all_from,
    date_range_all_to: rawValues.date_range_all_to,
    date_range_from: rawValues.date_range_from,
    date_range_to: rawValues.date_range_to,
    parseWarnings: rawValues.parseWarnings,
    _comment: "auto generated; do not manually modify",
    _time_dsc: "all times are in seconds",
    unit_time_stats: {},
    personnel_stats: {},
    region_stats: {},
    incident_stats: {
      types: {},
      num_incidents_last_365_days: rawValues.total_calls,
      num_incidents: rawValues.in_range_calls,
      num_daytime_incidents: rawValues.daytime_calls,
      num_nighttime_incidents: rawValues.nighttime_calls,
      incident_times: {
        sum: sum(incidentTimes),
        mean: _.round(mean(incidentTimes)),
        q1: _.round(q25(incidentTimes)),
        median: _.round(q50(incidentTimes)),
        q3: _.round(q75(incidentTimes)),
        min: min(incidentTimes),
        max: max(incidentTimes),
      },
      // TODO: see if we can start to get accurate data from dispatch!
      // marine: 0,
      // in_district: 0,
      // out_district: 0,
      num_overlapping_incidents: rawValues.overlapping_calls_num,
      num_per_day: {
        sum: sum(callsPerDay),
        mean: _.round(mean(callsPerDay)),
        q1: _.round(q25(callsPerDay)),
        median: _.round(q50(callsPerDay)),
        q3: _.round(q75(callsPerDay)),
        min: min(callsPerDay),
        max: max(callsPerDay),
      },
    },
  };

  const defaultIncidentTypes = {
    medical_rescue: 0,
    fire: 0,
    downgraded: 0,
    cancelled: 0,
    other: 0,
  };
  const typeStats = {};
  Object.assign(
    typeStats,
    defaultIncidentTypes,
    statsOutput.incident_stats.types,
    _.countBy(rawValues.incident_types),
  );
  statsOutput.incident_stats.types = typeStats;

  logger.verbose(
    `reactionTimes: ${_.chain(rawValues.reaction_times)
      .flatten()
      .compact()
      .value()}`,
  );

  new Map([
    [
      "first_unit_reaction",
      _.chain(rawValues.reaction_times).flatten().compact().value(),
    ],
    ["travel", _.chain(rawValues.travel_times).flatten().compact().value()],
    ["to_scene", _.chain(rawValues.to_scene_times).flatten().compact().value()],
    ["on_scene", _.chain(rawValues.on_scene_times).flatten().compact().value()],
  ]).forEach((arr, k) => {
    statsOutput.unit_time_stats[k] = {
      sum: sum(arr),
      mean: _.round(mean(arr)),
      q1: _.round(q25(arr)),
      median: _.round(q50(arr)),
      q3: _.round(q75(arr)),
      min: min(arr),
      max: max(arr),
    };
  });

  const collapsedPersonnelTimes = _.map(
    rawValues.personnel_times,
    function (pt) {
      return sum(pt);
    },
  );
  const incident = {
    sum: sum(collapsedPersonnelTimes),
    mean: _.round(mean(collapsedPersonnelTimes)),
    q1: _.round(q25(collapsedPersonnelTimes)),
    median: _.round(q50(collapsedPersonnelTimes)),
    q3: _.round(q75(collapsedPersonnelTimes)),
    min: min(collapsedPersonnelTimes),
    max: max(collapsedPersonnelTimes),
  };
  statsOutput.personnel_stats.time_on_incidents = incident;
  const personnelCount = _.map(rawValues.personnel, function (pt) {
    return pt.length;
  });
  statsOutput.personnel_stats.num_per_incidents = {
    mean: _.round(mean(personnelCount), 1),
    q1: _.round(q25(personnelCount), 1),
    median: _.round(q50(personnelCount), 1),
    q3: _.round(q75(personnelCount), 1),
    min: min(personnelCount),
    max: max(personnelCount),
  };
  statsOutput.personnel_stats.num_unique_responders = _.uniq(
    _.flatten(rawValues.personnel),
  ).length;

  const apparatusCount = _.map(rawValues.apparatus, function (a) {
    return a.length;
  });
  statsOutput.apparatus_stats = {
    num_per_incident: {
      mean: _.round(mean(apparatusCount), 1),
      q1: _.round(q25(apparatusCount), 1),
      median: _.round(q50(apparatusCount), 1),
      q3: _.round(q75(apparatusCount), 1),
      min: min(apparatusCount),
      max: max(apparatusCount),
    },
    num_unique_used: _.without(_.uniq(_.flatten(rawValues.apparatus)), "POV")
      .length,
  };

  const rawRegions = {
    north: [],
    south: [],
    central: [],
    other: [],
  };
  rawValues.call_regions.forEach((region, i) => {
    const callType = rawValues.incident_types[i];
    if (!statsOutput.region_stats[region]) {
      statsOutput.region_stats[region] = {};
    }
    if (!statsOutput.region_stats[region].incident_types) {
      statsOutput.region_stats[region].incident_types = {};
      statsOutput.region_stats[region].num_incidents = 0;
      Object.assign(
        statsOutput.region_stats[region].incident_types,
        defaultIncidentTypes,
      );
    }
    statsOutput.region_stats[region].incident_types[callType] += 1;
    statsOutput.region_stats[region].num_incidents += 1;
    if (rawValues.travel_times[i])
      rawRegions[region].push(rawValues.travel_times[i]);
  });
  Object.keys(rawRegions).forEach((region) => {
    if (!statsOutput.region_stats[region]) return; // go to next if there are no stats for this region
    const compactedArr = _.chain(rawRegions[region])
      .flatten()
      .compact()
      .value();
    statsOutput.region_stats[region].unit_travel_time = {
      sum: sum(compactedArr),
      mean: _.round(mean(compactedArr)),
      q1: _.round(q25(compactedArr)),
      median: _.round(q50(compactedArr)),
      q3: _.round(q75(compactedArr)),
      min: min(compactedArr),
      max: max(compactedArr),
    };
  });
  return statsOutput;
};

// https://stackoverflow.com/a/563442
const _addDays = function (date, days) {
  date = new Date(date.valueOf());
  date.setDate(date.getDate() + days);
  return date;
};

const _extractTimes = (records, fromCol, toCol) => {
  const fromColIsArr = _.isArray(fromCol);
  const times = _.map(records, function (r) {
    let fromVal = null;
    if (fromColIsArr) {
      _.every(fromCol, function (f) {
        if (r[f]) {
          fromVal = r[f];
          return false; // break loop; _.every will stop if a false is returned
        }
      });
    } else {
      fromVal = r[fromCol];
    }
    if (!fromVal) return null;
    const dateDiff = (r[toCol] - fromVal) / 1000;
    return dateDiff <= 3 ? null : dateDiff;
  });
  return times;
  // times = _.compact(times);
  // return sum(times)/times.length;
};

const _findFirst = (vals, fromCol, toCol) => {
  let sortedVals = null;
  if (toCol) {
    sortedVals = _.sortBy(vals, toCol);
    sortedVals = _.filter(sortedVals, function (v) {
      return v[toCol] - v[fromCol] > 2;
    });
  } else {
    sortedVals = _.sortBy(vals, fromCol);
  }
  sortedVals = _.filter(sortedVals, function (v) {
    if (toCol && !v[toCol]) return false;
    if (!v[fromCol]) return false;
    return true;
  });
  return sortedVals[0] ? sortedVals[0] : {};
};

const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const mean = (arr) => sum(arr) / arr.length;
const max = (arr) => Math.max(...arr);
const min = (arr) =>
  Math.min.apply(
    Math,
    arr.map(function (v) {
      return v == null ? Infinity : v;
    }),
  );
const q25 = (arr) => quantile(arr, 0.25);
const q50 = (arr) => quantile(arr, 0.5);
const q75 = (arr) => quantile(arr, 0.75);
// const median = q50

const quantile = (arr, q) => {
  const sorted = asc(arr);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  } else {
    return sorted[base];
  }
};

const asc = (arr) => arr.sort((a, b) => a - b);

// Export it to make it available outside
module.exports.retrieveCSVReport = retrieveCSVReport;
module.exports.parseCSV = parseCSV;
module.exports.generateStats = generateStats;
