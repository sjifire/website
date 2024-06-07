// const chai = require("chai");
// const assert = chai.assert;
// // const fs = require('fs')
// const path = require("path");
// const _ = require("lodash");
// // winston = require('winston')

// // NOTE: if you want to enable debugging while running a test, add
// // winston.level = 'debug'
// // and it will become quite verbose

// const esoScrapper = require("../src/modules/eso_scrapper");
// const sampleCSVPath = path.join(__dirname, "/files/sample_report.csv");
// // const sampleJSONPath = `${__dirname}/sample_stats.json`;
// // const sampleJSON = fs.readFileSync('sample_stats.json', "utf8");

// describe("parseCSV", function () {
//   let records = null;
//   let record = null;

//   before(() => {
//     records = esoScrapper.parseCSV(sampleCSVPath);
//     record = records[0];
//   });

//   it("should return expected number of records", function () {
//     assert.equal(records.length, 3063);
//   });

//   it("should return an array of objects", function () {
//     assert.equal(typeof record, "object");
//   });

//   it("should contain multiple personnel for each incident", function () {
//     const recordsWithMultiplePersonnel = _.filter(records, function (r) {
//       return r["Incident Number"] === "21-021224";
//     });
//     assert.equal(recordsWithMultiplePersonnel.length, 3);
//     const userIds = _.map(recordsWithMultiplePersonnel, "User Login ID");
//     assert.deepEqual(_.sortBy(userIds), [
//       "bsevier",
//       "cmcconnell",
//       "mvondassow",
//     ]);
//   });

//   it("should contain multiple apparatus if they exist in an incident", function () {
//     const recordsWithMultipleApparatus = _.filter(records, function (r) {
//       return r["Incident Number"] === "21-021228";
//     });
//     const apparatusNames = _.map(
//       recordsWithMultipleApparatus,
//       "Apparatus Name"
//     );
//     assert.deepEqual(_.uniq(_.sortBy(apparatusNames)), ["E31", "L31"]);
//   });

//   describe("record within array", function () {
//     it("should contain the expected keys", function () {
//       const recordFields = _.chain(record).keys().sort().value();
//       const expectedFields = [
//         "Alarm Date",
//         "Apparatus Name",
//         "Arrival Date",
//         "Clear Date",
//         "Dispatched Date",
//         "En Route Date",
//         "Incident Date",
//         "Incident Number",
//         "Incident Type Code",
//         "Last Unit Cleared Date",
//         "Station",
//         "User Login ID",
//       ];
//       _.each(expectedFields, function (f) {
//         const found = recordFields.indexOf(f) > -1;
//         assert.ok(found, `${f} not found in record`);
//       });
//     });

//     it("should convert date columns into date objects", function () {
//       const recordWithAllDates = records[10];
//       const dateFields = _.chain(record)
//         .keys()
//         .filter(function (k) {
//           return k.match(/\s+Date$/);
//         })
//         .value();
//       _.each(dateFields, function (f) {
//         const val = recordWithAllDates[f];
//         assert.ok(_.isDate(val), `${f} is not a Date Object`);
//       });
//     });

//     it("should set a date to null if it is not set in the csv", function () {
//       const recordWithoutArrivalDate = records[0];
//       assert.ok(
//         _.isNull(recordWithoutArrivalDate["Arrival Date"]),
//         "'Arrival Date' should be set to null"
//       );
//     });
//   });
// });

// // TODO: focus on edge case stats
// describe("generateStats", function () {
//   let records = null;
//   let parsedStats = null;

//   before(() => {
//     records = esoScrapper.parseCSV(sampleCSVPath);
//     parsedStats = esoScrapper.generateStats({ records: records });
//   });

//   it("should return expected high-level keys", function () {
//     const keys = Object.keys(parsedStats);
//     assert.include(
//       keys,
//       "apparatus_stats",
//       "incident_stats",
//       "personnel_stats",
//       "region_stats",
//       "unit_time_stats",
//       "updated_at",
//       "date_range_from",
//       "date_range_to"
//     );
//   });

//   it("should return expected keys within incident_stats", function () {
//     const keys = Object.keys(parsedStats.incident_stats);
//     assert.include(
//       keys,
//       "types",
//       "num_incidents_last_365_days",
//       "num_incidents",
//       "num_daytime_incidents",
//       "num_nighttime_incidents",
//       "incident_times",
//       "num_overlapping_incidents",
//       "num_per_day"
//     );
//     const typeKeys = Object.keys(parsedStats.incident_stats.types);
//     assert.include(
//       typeKeys,
//       "medical_rescue",
//       "fire",
//       "downgraded",
//       "cancelled",
//       "other"
//     );
//     const incidentTimeKeys = Object.keys(
//       parsedStats.incident_stats.incident_times
//     );
//     assert.include(
//       incidentTimeKeys,
//       "mean",
//       "median",
//       "q1",
//       "q3",
//       "min",
//       "max"
//     );
//     const numPerDayKeys = Object.keys(parsedStats.incident_stats.num_per_day);
//     assert.include(numPerDayKeys, "mean", "median", "q1", "q3", "min", "max");
//   });

//   it("should return expected statss", function () {
//     assert.deepEqual(parsedStats.unit_time_stats.first_unit_reaction, {
//       sum: 10033,
//       mean: 134,
//       median: 97,
//       q1: 59,
//       q3: 148,
//       min: 7,
//       max: 1190,
//     });
//     assert.deepEqual(parsedStats.unit_time_stats.travel, {
//       sum: 40703,
//       mean: 522,
//       median: 400,
//       q1: 180,
//       q3: 829,
//       min: 84,
//       max: 1672,
//     });
//     assert.deepEqual(parsedStats.unit_time_stats.to_scene, {
//       sum: 54468,
//       mean: 689,
//       median: 531,
//       q1: 302,
//       q3: 1050,
//       min: 123,
//       max: 2624,
//     });
//     assert.deepEqual(parsedStats.unit_time_stats.on_scene, {
//       sum: 141831,
//       mean: 1773,
//       median: 1553,
//       q1: 897,
//       q3: 2193,
//       min: 23,
//       max: 8718,
//     });
//   });

//   it("should handle a fire call with multiple responders and apparatus", function () {
//     // * there is one FF who got two different units in a serial manner;
//     //   make sure his total time is included but not duplicated personnel;
//     //   make sure both of those apparatus are included
//     // * a bunch of units don't have arrival or en route dates; make sure
//     //   we do the best we can and
//     // * lots of units coming and going at different times
//     const sampleBuildingFireCSV = path.join(
//       __dirname,
//       "/files/sample_building_fire.csv"
//     );
//     const records = esoScrapper.parseCSV(sampleBuildingFireCSV);
//     const parsedStats = esoScrapper.generateStats({ records: records });
//     // Only grabs the first due unit reactions time
//     assert.deepEqual(parsedStats.unit_time_stats.first_unit_reaction, {
//       sum: 199,
//       mean: 199,
//       median: 199,
//       q1: 199,
//       q3: 199,
//       min: 199,
//       max: 199,
//     });
//     assert.deepEqual(parsedStats.unit_time_stats.travel, {
//       sum: 5601,
//       mean: 800,
//       median: 931,
//       q1: 689,
//       q3: 951,
//       min: 329,
//       max: 1063,
//     });
//     assert.deepEqual(parsedStats.unit_time_stats.to_scene, {
//       sum: 10086,
//       mean: 1441,
//       median: 1338,
//       q1: 1237,
//       q3: 1646,
//       min: 1039,
//       max: 1944,
//     });
//     assert.deepEqual(parsedStats.unit_time_stats.on_scene, {
//       sum: 85203,
//       mean: 12172,
//       median: 8056,
//       q1: 5880,
//       q3: 16892,
//       min: 5311,
//       max: 26292,
//     });

//     assert.deepEqual(parsedStats.personnel_stats.time_on_incidents, {
//       sum: 194579,
//       mean: 194579,
//       median: 194579,
//       q1: 194579,
//       q3: 194579,
//       min: 194579,
//       max: 194579,
//     });
//     assert.deepEqual(parsedStats.personnel_stats.num_per_incidents, {
//       mean: 18,
//       median: 18,
//       q1: 18,
//       q3: 18,
//       min: 18,
//       max: 18,
//     });
//     // sev returned one vehicle and went and got another.
//     assert.equal(parsedStats.personnel_stats.num_unique_responders, 18);
//     assert.equal(parsedStats.incident_stats.types.fire, 1);
//     assert.include(parsedStats.incident_stats, {
//       num_incidents: 1,
//       num_nighttime_incidents: 1,
//     });

//     assert.equal(parsedStats.incident_stats.incident_times.mean, 28047);
//     assert.equal(parsedStats.incident_stats.num_per_day.max, 1);
//     assert.equal(parsedStats.apparatus_stats.num_unique_used, 11);
//     assert.equal(parsedStats.apparatus_stats.num_per_incident.mean, 11);

//     assert.equal(parsedStats.region_stats.north.incident_types.fire, 1);
//     assert.equal(parsedStats.region_stats.north.num_incidents, 1);
//     // this measures EACH units travel time, so they shouldn't all be the same number
//     assert.deepEqual(parsedStats.region_stats.north.unit_travel_time, {
//       sum: 5601,
//       mean: 800,
//       median: 931,
//       q1: 689,
//       q3: 951,
//       min: 329,
//       max: 1063,
//     });
//   });

//   it("should handle two calls that are dispatched out of order received by 911 calls", function () {
//     // 21-021224 comes in before 21-021223 (?? not sure how; I thought the run numbers were sequential?)
//     // but is paged AFTER 21-021223; so E31 leaves on x223 while L31 leaves 10 min or so later for x224
//     // Testing for quick reaction from E31 but slower reaction for L31 as it wasn't staffed with oncall
//     const samplePath = path.join(
//       __dirname,
//       "/files/sample_call_dispatched_before_previous_call.csv"
//     );
//     const records = esoScrapper.parseCSV(samplePath);
//     const parsedStats = esoScrapper.generateStats({ records: records });
//     assert.deepEqual(parsedStats.unit_time_stats.first_unit_reaction, {
//       sum: 645,
//       mean: 323,
//       median: 323,
//       q1: 190,
//       q3: 455,
//       min: 57,
//       max: 588,
//     });
//     assert.deepEqual(parsedStats.unit_time_stats.travel, {
//       sum: 1887,
//       mean: 944,
//       median: 944,
//       q1: 862,
//       q3: 1025,
//       min: 781,
//       max: 1106,
//     });
//     assert.deepEqual(parsedStats.unit_time_stats.on_scene, {
//       sum: 2954,
//       mean: 1477,
//       median: 1477,
//       q1: 1176,
//       q3: 1779,
//       min: 874,
//       max: 2080,
//     });

//     assert.deepEqual(parsedStats.personnel_stats.num_per_incidents, {
//       mean: 2.5,
//       median: 2.5,
//       q1: 2.3,
//       q3: 2.8,
//       min: 2,
//       max: 3,
//     });
//     assert.equal(parsedStats.personnel_stats.num_unique_responders, 5);
//     assert.equal(parsedStats.region_stats.north.num_incidents, 1);
//     assert.equal(
//       parsedStats.region_stats.north.incident_types.medical_rescue,
//       1
//     );
//     assert.equal(parsedStats.region_stats.south.num_incidents, 1);
//     assert.equal(
//       parsedStats.region_stats.south.incident_types.medical_rescue,
//       1
//     );

//     assert.equal(parsedStats.incident_stats.types.medical_rescue, 2);
//     assert.equal(parsedStats.incident_stats.num_incidents, 2);
//     assert.equal(parsedStats.incident_stats.num_daytime_incidents, 2);
//     assert.equal(parsedStats.incident_stats.num_nighttime_incidents, 0);
//     assert.equal(parsedStats.incident_stats.num_overlapping_incidents, 2);
//     assert.deepEqual(parsedStats.incident_stats.incident_times, {
//       sum: 5486,
//       mean: 2743,
//       median: 2743,
//       q1: 2390,
//       q3: 3096,
//       min: 2037,
//       max: 3449,
//     });

//     assert.equal(parsedStats.apparatus_stats.num_unique_used, 2);
//   });

//   it("should handle a data entry mistake under POV", function () {
//     // 21-022202 has a POV with the wrong En Route date AND the following event 21-022204,
//     // which is the backfill, has a bunch of date columns entered incorrectly
//     // * do NOT grab the POV as the reaction time
//     // * do NOT have a reaction time for the backfill unit even though they entered a time
//     //   that is the same as the dispatch time
//     // * do NOT count POV as an apparatus BUT make sure the personnel and times are included everywhere else
//     // FIXME: arguably, 21-022204 should NOT have an on-scene time BUT the data was entered
//     //    so incorrectly this may not be worth fixing as it could cause other problems
//     // * do NOT log a standby/cover as an overlapping call
//     const samplePath = path.join(
//       __dirname,
//       "/files/sample_date_entry_mistake_under_pov.csv"
//     );
//     const records = esoScrapper.parseCSV(samplePath);
//     const parsedStats = esoScrapper.generateStats({ records: records });
//     // only have one as the standby unit doesn't have a reaction time
//     assert.deepEqual(parsedStats.unit_time_stats.first_unit_reaction, {
//       sum: 107,
//       mean: 107,
//       median: 107,
//       q1: 107,
//       q3: 107,
//       min: 107,
//       max: 107,
//     });
//     // lots of travel times from ONLY the first call
//     assert.deepEqual(parsedStats.unit_time_stats.travel, {
//       sum: 2651,
//       mean: 663,
//       median: 497,
//       q1: 469,
//       q3: 691,
//       min: 440,
//       max: 1217,
//     });
//     // assert.deepEqual(parsedStats.unit_time_stats.on_scene, { sum: 2954, mean: 1477, median: 1477, min: 874, max: 2080 });

//     assert.deepEqual(parsedStats.personnel_stats.time_on_incidents, {
//       sum: 23088,
//       mean: 11544,
//       median: 11544,
//       q1: 8811,
//       q3: 14277,
//       min: 6078,
//       max: 17010,
//     });
//     assert.deepEqual(parsedStats.personnel_stats.num_per_incidents, {
//       mean: 4,
//       median: 4,
//       q1: 3.5,
//       q3: 4.5,
//       min: 3,
//       max: 5,
//     });
//     assert.equal(parsedStats.personnel_stats.num_unique_responders, 8);
//     assert.equal(parsedStats.region_stats.central.num_incidents, 2);
//     assert.equal(
//       parsedStats.region_stats.central.incident_types.medical_rescue,
//       1
//     );
//     // backfill is considered fire...
//     assert.equal(parsedStats.region_stats.central.incident_types.fire, 1);
//     assert.equal(parsedStats.region_stats.central.num_incidents, 2);

//     assert.equal(parsedStats.incident_stats.types.medical_rescue, 1);
//     assert.equal(parsedStats.incident_stats.types.fire, 1);
//     assert.equal(parsedStats.incident_stats.num_incidents, 2);
//     assert.equal(parsedStats.incident_stats.num_daytime_incidents, 2);
//     assert.equal(parsedStats.incident_stats.num_nighttime_incidents, 0);
//     assert.equal(parsedStats.incident_stats.num_overlapping_incidents, 0);
//     assert.deepEqual(parsedStats.incident_stats.incident_times, {
//       sum: 5970,
//       mean: 2985,
//       median: 2985,
//       q1: 2506,
//       q3: 3465,
//       min: 2026,
//       max: 3944,
//     });
//     // do NOT count POV...
//     assert.equal(parsedStats.apparatus_stats.num_unique_used, 4);
//     assert.equal(parsedStats.apparatus_stats.num_per_incident.max, 4);
//     assert.equal(parsedStats.apparatus_stats.num_per_incident.min, 1);
//   });

//   it("should handle a simultaneous call that was canceled en route", function () {
//     // for 21-021115, capt. called en route and dispatch informed her the call
//     // could be stood down, which is why she wasn't on the incident for long
//     // * make sure the canceled call incident time is the full time
//     // * make sure the travel and on scene times for the 2nd call don't exist
//     // * make sure both are flagged as overlapping incidents!
//     const samplePath = path.join(
//       __dirname,
//       "/files/sample_different_call_triggered_during_incident_but_cancelled_en_route.csv"
//     );
//     const records = esoScrapper.parseCSV(samplePath);
//     const parsedStats = esoScrapper.generateStats({ records: records });
//     // both have reaction times
//     assert.deepEqual(parsedStats.unit_time_stats.first_unit_reaction, {
//       sum: 353,
//       mean: 177,
//       median: 177,
//       q1: 144,
//       q3: 209,
//       min: 112,
//       max: 241,
//     });
//     // lots of travel times from ONLY the first call
//     assert.deepEqual(parsedStats.unit_time_stats.travel, {
//       sum: 606,
//       mean: 606,
//       median: 606,
//       q1: 606,
//       q3: 606,
//       min: 606,
//       max: 606,
//     });
//     assert.deepEqual(parsedStats.unit_time_stats.on_scene, {
//       sum: 1721,
//       mean: 1721,
//       median: 1721,
//       q1: 1721,
//       q3: 1721,
//       min: 1721,
//       max: 1721,
//     });

//     assert.deepEqual(parsedStats.personnel_stats.time_on_incidents, {
//       sum: 5150,
//       mean: 2575,
//       median: 2575,
//       q1: 1424,
//       q3: 3727,
//       min: 272,
//       max: 4878,
//     });
//     assert.deepEqual(parsedStats.personnel_stats.num_per_incidents, {
//       mean: 1.5,
//       median: 1.5,
//       q1: 1.3,
//       q3: 1.8,
//       min: 1,
//       max: 2,
//     });
//     assert.equal(parsedStats.personnel_stats.num_unique_responders, 3);
//     assert.equal(parsedStats.region_stats.central.num_incidents, 2);
//     assert.equal(
//       parsedStats.region_stats.central.incident_types.medical_rescue,
//       1
//     );
//     assert.equal(parsedStats.region_stats.central.incident_types.cancelled, 1);

//     assert.equal(parsedStats.incident_stats.types.medical_rescue, 1);
//     assert.equal(parsedStats.incident_stats.types.cancelled, 1);
//     assert.equal(parsedStats.incident_stats.num_incidents, 2);
//     assert.equal(parsedStats.incident_stats.num_daytime_incidents, 2);
//     assert.equal(parsedStats.incident_stats.num_nighttime_incidents, 0);
//     assert.equal(parsedStats.incident_stats.num_overlapping_incidents, 2);
//     assert.deepEqual(parsedStats.incident_stats.incident_times, {
//       sum: 2711,
//       mean: 1356,
//       median: 1356,
//       q1: 814,
//       q3: 1897,
//       min: 272,
//       max: 2439,
//     });
//     assert.equal(parsedStats.apparatus_stats.num_unique_used, 2);
//   });

//   it("should handle overlapping calls with only one responding unit", function () {
//     // one unit goes to back-to-back calls
//     //  * the reaction time on the 2nd call should be quite long
//     //  * even though multiple calls, it is the same unit and crew
//     //  * incident times should take into account the delayed response on the 2nd call
//     //  * make sure both are flagged as overlapping incidents!
//     const samplePath = path.join(
//       __dirname,
//       "/files/sample_overlapping_calls_one_response_unit.csv"
//     );
//     const records = esoScrapper.parseCSV(samplePath);
//     const parsedStats = esoScrapper.generateStats({ records: records });
//     // both have reaction times, but the 2nd one is notably slower
//     assert.deepEqual(parsedStats.unit_time_stats.first_unit_reaction, {
//       sum: 1256,
//       mean: 628,
//       median: 628,
//       q1: 347,
//       q3: 909,
//       min: 66,
//       max: 1190,
//     });
//     assert.deepEqual(parsedStats.unit_time_stats.travel, {
//       sum: 1300,
//       mean: 650,
//       median: 650,
//       q1: 472,
//       q3: 829,
//       min: 293,
//       max: 1007,
//     });
//     assert.deepEqual(parsedStats.unit_time_stats.on_scene, {
//       sum: 3440,
//       mean: 1720,
//       median: 1720,
//       q1: 1599,
//       q3: 1842,
//       min: 1477,
//       max: 1963,
//     });

//     assert.deepEqual(parsedStats.personnel_stats.time_on_incidents, {
//       sum: 17988,
//       mean: 8994,
//       median: 8994,
//       q1: 7251,
//       q3: 10737,
//       min: 5508,
//       max: 12480,
//     });
//     assert.deepEqual(parsedStats.personnel_stats.num_per_incidents, {
//       mean: 3,
//       median: 3,
//       q1: 3,
//       q3: 3,
//       min: 3,
//       max: 3,
//     });
//     assert.equal(parsedStats.personnel_stats.num_unique_responders, 3);
//     assert.equal(parsedStats.region_stats.central.num_incidents, 1);
//     assert.equal(
//       parsedStats.region_stats.central.incident_types.medical_rescue,
//       1
//     );
//     assert.equal(parsedStats.region_stats.north.num_incidents, 1);
//     assert.equal(
//       parsedStats.region_stats.north.incident_types.medical_rescue,
//       1
//     );

//     assert.equal(parsedStats.incident_stats.types.medical_rescue, 2);
//     // assert.equal(parsedStats.incident_stats.num_incidents, 2)
//     assert.equal(parsedStats.incident_stats.num_daytime_incidents, 0);
//     assert.equal(parsedStats.incident_stats.num_nighttime_incidents, 2);
//     assert.equal(parsedStats.incident_stats.num_overlapping_incidents, 2);
//     assert.deepEqual(parsedStats.incident_stats.incident_times, {
//       sum: 5996,
//       mean: 2998,
//       median: 2998,
//       q1: 2417,
//       q3: 3579,
//       min: 1836,
//       max: 4160,
//     });
//     assert.equal(parsedStats.apparatus_stats.num_unique_used, 1);
//   });

//   it("should handle a long call standby", function () {
//     // showing 3 calls; the first is a standard call, then there is an out of district
//     // call with a standy.  The record is a bit messy because JUST the AO of E31 is
//     // released, and he comes back to station to standby... but the officer is
//     // listed as cleared but then shows up on the FB
//     // Standby is quick because the engine was returning when it was dispatched
//     // out
//     // test:
//     //  * still get the right personnel on the right rigs, and their times line up;
//     //    do not count the chief or his time twice even though he is on the call
//     //    assigned to two different rigs
//     //  * the boat doesn't have travel time because it was cancelled en route
//     //  * the out-of-district is handled appropriately.
//     //  * only the 1st and last incidents have an on-scene time
//     //  * make sure these are not logged as overlapping calls because one of them is a standby
//     const samplePath = path.join(
//       __dirname,
//       "/files/sample_long_call_standby.csv"
//     );
//     const records = esoScrapper.parseCSV(samplePath);
//     const parsedStats = esoScrapper.generateStats({ records: records });

//     // both have reaction times, but the 2nd one is notably slower
//     assert.deepEqual(parsedStats.unit_time_stats.first_unit_reaction, {
//       sum: 129,
//       mean: 65,
//       median: 65,
//       q1: 51,
//       q3: 78,
//       min: 38,
//       max: 91,
//     });
//     assert.deepEqual(parsedStats.unit_time_stats.travel, {
//       sum: 700,
//       mean: 350,
//       median: 350,
//       q1: 285,
//       q3: 415,
//       min: 220,
//       max: 480,
//     });
//     assert.deepEqual(parsedStats.unit_time_stats.on_scene, {
//       sum: 5598,
//       mean: 2799,
//       median: 2799,
//       q1: 2797,
//       q3: 2801,
//       min: 2795,
//       max: 2803,
//     });

//     assert.deepEqual(parsedStats.personnel_stats.time_on_incidents, {
//       sum: 27850,
//       mean: 9283,
//       median: 6642,
//       q1: 6427,
//       q3: 10819,
//       min: 6212,
//       max: 14996,
//     });
//     assert.deepEqual(parsedStats.personnel_stats.num_per_incidents, {
//       mean: 3,
//       median: 2,
//       q1: 2,
//       q3: 3.5,
//       min: 2,
//       max: 5,
//     });
//     assert.equal(parsedStats.personnel_stats.num_unique_responders, 6);
//     assert.equal(parsedStats.region_stats.other.num_incidents, 1);

//     assert.equal(parsedStats.incident_stats.types.medical_rescue, 1);
//     assert.equal(parsedStats.incident_stats.types.fire, 1);
//     assert.equal(parsedStats.incident_stats.types.cancelled, 1);
//     assert.equal(parsedStats.incident_stats.num_incidents, 3);
//     // make sure this is sorting and uniq'ing correctly
//     assert.equal(parsedStats.incident_stats.num_incidents_last_365_days, 3);
//     assert.equal(parsedStats.incident_stats.num_daytime_incidents, 3);
//     assert.equal(parsedStats.incident_stats.num_nighttime_incidents, 0);
//     assert.equal(parsedStats.incident_stats.num_overlapping_incidents, 0);
//     assert.deepEqual(parsedStats.incident_stats.incident_times, {
//       sum: 10029,
//       mean: 3343,
//       median: 3321,
//       q1: 3214,
//       q3: 3462,
//       min: 3106,
//       max: 3602,
//     });
//     assert.equal(parsedStats.apparatus_stats.num_unique_used, 3);
//   });

//   it("should handle a standby where the standby unit cleared before the first incident", function () {
//     // * this one is tricky because the standby unit has bad dates... it has times filled in
//     //   for the dispatch date being used for en route and arrival, which it really shouldn't be
//     //   this is why we don't show multiple reaction times and the standby unit is not included in travel times
//     // * make sure both are flagged as overlapping incidents!
//     const samplePath = path.join(
//       __dirname,
//       "/files/sample_incident_with_standby_call.csv"
//     );
//     const records = esoScrapper.parseCSV(samplePath);
//     const parsedStats = esoScrapper.generateStats({ records: records });

//     assert.deepEqual(parsedStats.unit_time_stats.first_unit_reaction, {
//       sum: 107,
//       mean: 107,
//       median: 107,
//       q1: 107,
//       q3: 107,
//       min: 107,
//       max: 107,
//     });
//     assert.deepEqual(parsedStats.unit_time_stats.travel, {
//       sum: 2651,
//       mean: 663,
//       median: 497,
//       q1: 469,
//       q3: 691,
//       min: 440,
//       max: 1217,
//     });
//     assert.deepEqual(parsedStats.unit_time_stats.on_scene, {
//       sum: 11556,
//       mean: 2311,
//       median: 2026,
//       q1: 1959,
//       q3: 2727,
//       min: 1522,
//       max: 3322,
//     });

//     assert.deepEqual(parsedStats.personnel_stats.time_on_incidents, {
//       sum: 23088,
//       mean: 11544,
//       median: 11544,
//       q1: 8811,
//       q3: 14277,
//       min: 6078,
//       max: 17010,
//     });
//     assert.deepEqual(parsedStats.personnel_stats.num_per_incidents, {
//       mean: 4,
//       median: 4,
//       q1: 3.5,
//       q3: 4.5,
//       min: 3,
//       max: 5,
//     });
//     assert.equal(parsedStats.personnel_stats.num_unique_responders, 8);
//     assert.equal(parsedStats.region_stats.central.num_incidents, 2);

//     assert.equal(parsedStats.incident_stats.types.medical_rescue, 1);
//     assert.equal(parsedStats.incident_stats.types.fire, 1);
//     assert.equal(parsedStats.incident_stats.num_incidents, 2);
//     // make sure this is sorting and uniq'ing correctly
//     assert.equal(parsedStats.incident_stats.num_incidents_last_365_days, 2);
//     assert.equal(parsedStats.incident_stats.num_daytime_incidents, 2);
//     assert.equal(parsedStats.incident_stats.num_nighttime_incidents, 0);
//     assert.equal(parsedStats.incident_stats.num_overlapping_incidents, 0);
//     assert.deepEqual(parsedStats.incident_stats.incident_times, {
//       sum: 5970,
//       mean: 2985,
//       median: 2985,
//       q1: 2506,
//       q3: 3465,
//       min: 2026,
//       max: 3944,
//     });
//     assert.equal(parsedStats.apparatus_stats.num_unique_used, 4);
//   });

//   it("should handle missing arrival dates", function () {
//     const samplePath = path.join(
//       __dirname,
//       "/files/sample_missing_arrival_date.csv"
//     );
//     const records = esoScrapper.parseCSV(samplePath);
//     const parsedStats = esoScrapper.generateStats({ records: records });

//     assert.deepEqual(parsedStats.unit_time_stats.first_unit_reaction, {
//       sum: 147,
//       mean: 147,
//       median: 147,
//       q1: 147,
//       q3: 147,
//       min: 147,
//       max: 147,
//     });
//     assert.deepEqual(parsedStats.unit_time_stats.travel, {
//       sum: 2521,
//       mean: 840,
//       median: 833,
//       q1: 776,
//       q3: 901,
//       min: 719,
//       max: 969,
//     });
//     assert.deepEqual(parsedStats.unit_time_stats.on_scene, {
//       sum: 7086,
//       mean: 2362,
//       median: 2362,
//       q1: 2362,
//       q3: 2362,
//       min: 2362,
//       max: 2362,
//     });

//     assert.deepEqual(parsedStats.personnel_stats.time_on_incidents, {
//       sum: 25212,
//       mean: 25212,
//       median: 25212,
//       q1: 25212,
//       q3: 25212,
//       min: 25212,
//       max: 25212,
//     });
//     assert.deepEqual(parsedStats.personnel_stats.num_per_incidents, {
//       mean: 8,
//       median: 8,
//       q1: 8,
//       q3: 8,
//       min: 8,
//       max: 8,
//     });
//     assert.equal(parsedStats.personnel_stats.num_unique_responders, 8);
//     assert.equal(parsedStats.region_stats.north.num_incidents, 1);

//     assert.equal(parsedStats.incident_stats.types.medical_rescue, 1);
//     assert.equal(parsedStats.incident_stats.num_incidents, 1);
//     // make sure this is sorting and uniq'ing correctly
//     assert.equal(parsedStats.incident_stats.num_incidents_last_365_days, 1);
//     assert.equal(parsedStats.incident_stats.num_daytime_incidents, 1);
//     assert.equal(parsedStats.incident_stats.num_nighttime_incidents, 0);
//     assert.equal(parsedStats.incident_stats.num_overlapping_incidents, 0);
//     assert.deepEqual(parsedStats.incident_stats.incident_times, {
//       sum: 3478,
//       mean: 3478,
//       median: 3478,
//       q1: 3478,
//       q3: 3478,
//       min: 3478,
//       max: 3478,
//     });
//     assert.equal(parsedStats.apparatus_stats.num_unique_used, 3);
//   });

//   it("should be able to compute a shorter 10 dayRange", function () {
//     const dayRange = 10;
//     const shortParsedStats = esoScrapper.generateStats({
//       records: records,
//       dayRange: dayRange,
//     });
//     assert.deepEqual(
//       shortParsedStats.date_range_to,
//       new Date("2021-12-27T23:59:59.999Z")
//     );
//     assert.deepEqual(
//       shortParsedStats.date_range_from,
//       new Date("2021-12-18T00:00:00.000Z")
//     );

//     assert.equal(
//       shortParsedStats.unit_time_stats.first_unit_reaction.sum,
//       3168
//     );
//     assert.equal(shortParsedStats.unit_time_stats.travel.sum, 18521);
//     assert.equal(shortParsedStats.incident_stats.num_incidents, 27);
//     assert.equal(shortParsedStats.personnel_stats.num_unique_responders, 15);
//     assert.equal(shortParsedStats.incident_stats.incident_times.median, 2172);
//   });

//   it("should be able to compute a shorter 9 dayRange", function () {
//     // these should be different
//     const dayRange = 9;
//     const shortParsedStats = esoScrapper.generateStats({
//       records: records,
//       dayRange: dayRange,
//     });
//     assert.deepEqual(
//       shortParsedStats.date_range_to,
//       new Date("2021-12-27T23:59:59.999Z")
//     );
//     assert.deepEqual(
//       shortParsedStats.date_range_from,
//       new Date("2021-12-19T00:00:00.000Z")
//     );

//     assert.equal(
//       shortParsedStats.unit_time_stats.first_unit_reaction.sum,
//       2714
//     );
//     assert.equal(shortParsedStats.unit_time_stats.travel.sum, 16386);
//     assert.equal(shortParsedStats.incident_stats.num_incidents, 25);
//     assert.equal(shortParsedStats.personnel_stats.num_unique_responders, 14);
//     assert.equal(shortParsedStats.incident_stats.incident_times.median, 2059);
//   });

//   it("should be able to compute from a different end date", function () {
//     const stopDate = new Date("2021-12-26T23:59:59.999Z");
//     const shortParsedStats = esoScrapper.generateStats({
//       records: records,
//       stopDate: stopDate,
//     });
//     assert.deepEqual(
//       shortParsedStats.date_range_to,
//       new Date("2021-12-26T23:59:59.999Z")
//     );
//     assert.deepEqual(
//       shortParsedStats.date_range_from,
//       new Date("2021-11-27T00:00:00.000Z")
//     );

//     assert.equal(
//       shortParsedStats.unit_time_stats.first_unit_reaction.sum,
//       9734
//     );
//     assert.equal(shortParsedStats.unit_time_stats.travel.sum, 37447);
//     assert.equal(shortParsedStats.incident_stats.num_incidents, 78);
//     assert.equal(shortParsedStats.personnel_stats.num_unique_responders, 22);
//     assert.equal(shortParsedStats.incident_stats.incident_times.median, 2123);
//   });

//   it("should be able to compute from a string end date", function () {
//     const shortParsedStats = esoScrapper.generateStats({
//       records: records,
//       stopDate: "2021-12-26",
//     });
//     assert.deepEqual(
//       shortParsedStats.date_range_to,
//       new Date("2021-12-26T23:59:59.999Z")
//     );
//     assert.deepEqual(
//       shortParsedStats.date_range_from,
//       new Date("2021-11-27T00:00:00.000Z")
//     );
//     assert.equal(shortParsedStats.incident_stats.num_incidents, 78);
//     assert.equal(shortParsedStats.personnel_stats.num_unique_responders, 22);
//   });

//   it("should be able to compute from a different start date", function () {
//     const startDate = new Date("2021-10-01");
//     const shortParsedStats = esoScrapper.generateStats({
//       records: records,
//       startDate: startDate,
//     });
//     assert.deepEqual(
//       shortParsedStats.date_range_to,
//       new Date("2021-10-30T23:59:59.999Z")
//     );
//     assert.deepEqual(
//       shortParsedStats.date_range_from,
//       new Date("2021-10-01T00:00:00.000Z")
//     );

//     assert.equal(
//       shortParsedStats.unit_time_stats.first_unit_reaction.sum,
//       9819
//     );
//     assert.equal(shortParsedStats.unit_time_stats.travel.sum, 39961);
//     assert.equal(shortParsedStats.incident_stats.num_incidents, 89);
//     assert.equal(shortParsedStats.personnel_stats.num_unique_responders, 27);
//     assert.equal(shortParsedStats.incident_stats.incident_times.median, 1809);
//   });

//   it("should be able to compute from a string start date", function () {
//     const shortParsedStats = esoScrapper.generateStats({
//       records: records,
//       startDate: "2021-10-01",
//     });
//     assert.deepEqual(
//       shortParsedStats.date_range_to,
//       new Date("2021-10-30T23:59:59.999Z")
//     );
//     assert.deepEqual(
//       shortParsedStats.date_range_from,
//       new Date("2021-10-01T00:00:00.000Z")
//     );

//     assert.equal(shortParsedStats.incident_stats.num_incidents, 89);
//     assert.equal(shortParsedStats.personnel_stats.num_unique_responders, 27);
//   });

//   it("should be able to compute from a start and stop date", function () {
//     const shortParsedStats = esoScrapper.generateStats({
//       records: records,
//       startDate: "2021-10-01",
//       stopDate: "2021-10-10",
//     });
//     assert.deepEqual(
//       shortParsedStats.date_range_to,
//       new Date("2021-10-10T23:59:59.999Z")
//     );
//     assert.deepEqual(
//       shortParsedStats.date_range_from,
//       new Date("2021-10-01T00:00:00.000Z")
//     );

//     assert.equal(
//       shortParsedStats.unit_time_stats.first_unit_reaction.sum,
//       3389
//     );
//     assert.equal(shortParsedStats.unit_time_stats.travel.sum, 14351);
//     assert.equal(shortParsedStats.incident_stats.num_incidents, 27);
//     assert.equal(shortParsedStats.personnel_stats.num_unique_responders, 21);
//     assert.equal(shortParsedStats.incident_stats.incident_times.median, 1890);
//   });
// });


// describe("test start and stop datees", function () {
//   let records = null;
//   let parsedStats = null;

//   before(() => {
//     records = esoScrapper.parseCSV(sampleCSVPath);
//   });

//   it("should throw an error if the start date is after the stop date", function () {
//     startDate = new Date('12/19/2020');
//     stopDate = new Date('12/28/2020');
//     badParams = { records: records, startDate: stopDate, stopDate: startDate }
//     goodParams = { records: records, startDate: startDate, stopDate: stopDate }
//     assert.throws(function () { esoScrapper.generateStats(badParams) }, Error, "Start Date cannot be after stop date");
//     esoScrapper.generateStats(goodParams);
//   })

//   it("should handle a day range, inclusive", function () {
//     startDate = new Date('12/28/2020'); // include all records in 12/28!
//     stopDate = new Date('1/1/2021'); // include all records in 1/1!
//     parsedStats = esoScrapper.generateStats({ records: records, startDate: startDate, stopDate: stopDate });
//     assert.deepEqual(
//       parsedStats.date_range_from,
//       new Date("2020-12-28T00:00:00.000Z")
//     );
//     assert.deepEqual(
//       parsedStats.date_range_to,
//       new Date("2021-01-01T23:59:59.999Z")
//     );
//     assert.equal(parsedStats.incident_stats.num_incidents, 5)
//     assert.equal(parsedStats.incident_stats.num_daytime_incidents, 1)
//     assert.equal(parsedStats.incident_stats.num_nighttime_incidents, 4)
//   })
//   it("should default to a 30 day date range IF only a stopDate is added", function () {
//     stopDate = new Date('1/30/2021');
//     parsedStats = esoScrapper.generateStats({ records: records, stopDate: stopDate });
//     assert.deepEqual(
//       parsedStats.date_range_from,
//       new Date("2021-01-01T00:00:00.000Z")
//     );
//     assert.deepEqual(
//       parsedStats.date_range_to,
//       new Date("2021-01-30T23:59:59.999Z")
//     );
//     assert.equal(parsedStats.incident_stats.num_incidents, 53)
//   })

// });
