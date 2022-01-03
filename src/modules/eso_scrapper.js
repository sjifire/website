"use strict";
/**
 * MODULE:
 * Helper methods to retrieve and process an ESO report
 * into a stats JSON file.
 *
 *
 * WARNINGS & TODOs:
 *  - This module is tightly coupled with the needs
 *    of SJIF&R, such as the stats computed from
 *    the raw data.
 *  - this is tightly coupled to the report columns and
 *    one incident per row
 *  - tightly coupled to quirks of SJIF&R, such as
 *    zones (south, north, central), and types
 */
const fs = require('fs');
const _ = require('lodash');
const logger = require('./logger')

process.env.TZ = 'UTC';


const DETAILED_STATS_DAY_RANGE = 30;

const SOUTH_STATIONS   = ["32", "33"];
const CENTRAL_STATIONS = ["31", "36"];
const NORTH_STATIONS   = ["34", "35"];

const MEDICAL_TYPES    = ['3'];           // Medical & Rescue
const FIRE_TYPE        = ['1', '4', '5']; // fire, hazard, backfill
const CANCELLED_TYPES  = ['61']
const DOWNGRADE_TYPES  = ['6', '7']
const BACKFILL_TYPES   = ['571']

const DAYTIME_RANGE   = [6,7,8,9,10,11,12,13,14,15,16,17];
const NIGHTTIME_RANGE = [18,19,20,21,22,23,0,1,2,3,4,5];

const ESO_TIMEOUT   = 600000; //the report can take a LONG time to generate;
const ESO_LOGIN_URL = 'https://www.esosuite.net/login';


const retrieveCSVReport = async function(username, password, agency, reportName, headless){

  const os = require('os');
  const path = require('path');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromium'));

  const { chromium } = require('playwright');
  const context = await chromium.launchPersistentContext(userDataDir, { headless: headless, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(ESO_LOGIN_URL);

  // Interact with login form
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="agency"]',  agency)
  await page.click('button[type="submit"]');

  // go to ad-hoc reporting engine and run report
  await page.click('text=Ad-Hoc');

  const [reportPage] = await Promise.all([
    context.waitForEvent('page'),
    page.click('text=' + reportName) // Opens a new tab
  ])
  //wait for report to finish displaying
  await reportPage.waitForLoadState('networkidle', {timeout: ESO_TIMEOUT});
  // download CSV of the report.
  const [ download ] = await Promise.all([
    // Start waiting for the download
    reportPage.waitForEvent('download', {timeout: ESO_TIMEOUT}),
    // Perform the action that initiates download
    reportPage.click('#CSV', {timeout: ESO_TIMEOUT})
  ]);
  let csvPath = await download.path();
  context.close();
  return csvPath;
};


const parseCSV = function(csvPath){
  const content = fs.readFileSync(csvPath, "utf8");
  const {parse} = require('csv-parse/sync');
  const records = parse(content, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    cast: true,
    cast_date: true,
    trim: true
  });

  // cleanup record oddities
  records.forEach(record => {
    Object.keys(record).forEach((key)=>{
      if(key.toLocaleLowerCase().endsWith(" date") && record[key] === ''){
        record[key] = null;
      }
    })
  });
  // sort by early to latest; and sort by the time dispatch pages us, NOT when
  // dispatch received the call as they don't always page in the same order
  return _.sortBy(records, 'Dispatched Date');
};

const generateStats = (records) => {
  let raw_values = processRecords(records);
  return createStats(raw_values);
};


/**
 * Private helper methods
 */
const processRecords = function(records){
  // stats for the day range from most recent record:
  let mostRecentRecordDate = _.last(records)['Dispatched Date']
  // NOTE: this date range makes it exclusive, NOT inclusive...
  // so if 30 days, it would go from 12/25/21 back to 11/26/21
  let dateCutoff = mostRecentRecordDate.addDays(-DETAILED_STATS_DAY_RANGE).addDays(1);
  dateCutoff.setHours(0,0,0,0);
  let recordsInRange = records.filter(record => record['Alarm Date'] > dateCutoff)
  //the groupBy sorts by lexographical ordering of the Incident Number; this isn't
  //always entered in correctly nor is the order of the incident the same order
  //as when pages go out.  SO we list the incidents by dispatch date order,
  //yet use the groupBy to then process those records within each incident
  let incidentsInDispatchedDateOrder = _.uniq(_.map(recordsInRange, 'Incident Number'))
  let byIncidentInRange = _.groupBy(recordsInRange, 'Incident Number');

  let raw_values={
    incident_ids:    [],
    calls_per_day:   {},
    reaction_times:  [],
    travel_times:    [],
    to_scene_times:  [],
    on_scene_times:  [],
    incident_times:  [],
    personnel:       [],
    personnel_times: [],
    apparatus:    [],
    call_regions: [],
    incident_types:   [],
    overlapping_calls_num: 0,
    daytime_calls:         0,
    nighttime_calls:       0,
    in_range_calls:   _.size(byIncidentInRange),
    total_calls:      _.uniqBy(records, 'Incident Number').length,
    date_range_from: dateCutoff,
    date_range_to:   mostRecentRecordDate
  }
  // loop for every day in the detailed range and set it up with zero.
  // this way we log the days that have no activit.
  for (var day = new Date(dateCutoff.getTime()); day <= mostRecentRecordDate; day.setDate(day.getDate() + 1)) {
    raw_values.calls_per_day[day.toLocaleDateString()] = 0;
  }

  let prevCallEnd = null;
  let inOverlappingCalls = false;
  incidentsInDispatchedDateOrder.forEach(incidentID => {
    raw_values.incident_ids.push(incidentID);
    let incidentRecords = byIncidentInRange[incidentID];
    //baseRecord is used for all columns that are the same within the incidentID grouping
    let baseRecord      = incidentRecords[0];
    let dispatchedDate  = baseRecord['Dispatched Date'];
    let incidentTypeCall = baseRecord['Incident Type Code'].toString();
    raw_values.calls_per_day[dispatchedDate.toLocaleDateString()]++;

    // lets check some times
    if(dispatchedDate - baseRecord['Alarm Date'] < 2) logger.verbose(`${incidentID} has incorrect Alarm & Dispatch times`)
    if(incidentTypeCall == '571' && (_.isDate(baseRecord['En Route Date']) || _.isDate(baseRecord['Arrival Date']))) logger.verbose(`${incidentID} is a standby yet has en route or arrival dates set`)


    if(prevCallEnd && prevCallEnd > dispatchedDate){
      if (!BACKFILL_TYPES.some(v => incidentTypeCall.startsWith(v))){
        raw_values.overlapping_calls_num += 1
        if(!inOverlappingCalls){
          // we didn't catch the first call that overlaps this one;
          // lets make sure it is counted!
          raw_values.overlapping_calls_num += 1
          inOverlappingCalls = true
        }
      }
    }else{
      inOverlappingCalls = false
    }
    prevCallEnd = baseRecord['Last Unit Cleared Date'];

    if(NIGHTTIME_RANGE.includes(dispatchedDate.getHours())){
      raw_values.nighttime_calls += 1;
    }else{
      raw_values.daytime_calls += 1;
    }
    let incidentUnitRecords = _.chain(incidentRecords)
                               .map((r) => _.omit(r, 'User Login ID'))
                               .filter((r, loc, allRecords) => (loc === 0) ? true : !_.isEqual(r, allRecords[loc-1]))
                               .value();
    // COMPUTE times based upon the Unit/Apparatus time, NOT each individual time
    let firstEnRouteUnit = findFirst(incidentUnitRecords, 'Dispatched Date', 'En Route Date');
    let reactionTime     = (firstEnRouteUnit['En Route Date'] - dispatchedDate)/1000;
    if(_.isNaN(reactionTime)) reactionTime = null;
    let firstArrivedUnit = findFirst(incidentUnitRecords, 'Arrival Date');
    let travelTimes      = extractTimes(incidentUnitRecords, 'En Route Date', 'Arrival Date');
    let toSceneTimes     = extractTimes(incidentUnitRecords, 'Dispatched Date', 'Arrival Date')
    // let onSceneTime   = (baseRecord['Last Unit Cleared Date'] - firstArrivedUnit['Arrival Date'])/1000;
    let onSceneTimes     = extractTimes(incidentUnitRecords, 'Arrival Date', 'Clear Date')
    if(_.isEmpty(_.compact(travelTimes))){
      logger.debug(`${incidentID} has empty travel times`)
      // travelTimes      = null;
      // toSceneTimes     = null
      // firstArrivedUnit = null;
      // onSceneTimes     = null;
    }
    if(_.isEmpty(_.compact(onSceneTimes))) logger.debug(`${incidentID} has empty on-scene times`)

    let incidentTime = (baseRecord['Last Unit Cleared Date'] - dispatchedDate)/1000;
    if(_.isNull(reactionTime)) logger.verbose(`${incidentID} has no reaction time`)
    if(_.isNull(reactionTime)) logger.verbose(`${incidentID} has no reaction time`)
    raw_values.reaction_times.push(reactionTime);
    raw_values.travel_times.push(travelTimes);
    raw_values.to_scene_times.push(toSceneTimes);
    raw_values.on_scene_times.push(onSceneTimes);
    raw_values.incident_times.push(incidentTime);

    let personnel_times = _.map(incidentRecords,(v) => (v['Clear Date'] - v['Dispatched Date'])/1000);
    let personnel       = _.map(incidentRecords, (v) => v['User Login ID']);
    let uniqPersonnel   = _.uniq(personnel);
    if(uniqPersonnel.length !== personnel.length){
      // we have duplicate entries; this can happen if a rig is
      // assigned and a user hops into a different rig (e.g. FB)
      // while the first rig is cleared..
      // ACTION: remove dup users; use the longest time that they have
      //   1) remove all duplicate names and times
      //   2) find the locatin of the max time for that person
      //   3) insert one name and max time back into respective arrays
      _.each(uniqPersonnel, (p) => {
        var fromIndex = -1
        let foundIndexes = []
        while((fromIndex = _.findIndex(personnel, _.matches(p), fromIndex+1)) > -1){
          foundIndexes.push(fromIndex);
        }
        if(foundIndexes.length <= 1) return;  // no DUPS!  continue to next
        var removedPersonnel = [];
        var removedTimes     = [];
        _.each(foundIndexes, (i) => {
          // we can't delete/splice because then the indexing will be messed up.
          removedPersonnel.push(personnel[i]);
          personnel[i] = null;
          removedTimes.push(personnel_times[i]);
          personnel_times[i] = null;
        })
        personnel.push(removedPersonnel[0]);
        // lets find the earliest they were on scene, and the latest they left
        // and use that range.
        // vs find the largest time; sometimes a user will pop to a different
        // unit and be in two units for the duratin (which is incorrect); and sometimes
        // they will be in multiple units in a serial manner (go get one apparatus, return, get a different one, etc)
        let personnelRecords =  _.filter(incidentRecords, (v) => v['User Login ID'] == p);
        let earliestDispatchDate = _.sortBy(personnelRecords, 'Dispatched Date')[0]['Dispatched Date'];
        let latestClearDate = _.reverse(_.sortBy(personnelRecords, 'Clear Date'))[0]['Clear Date'];
        let newPersonnelTime = (latestClearDate - earliestDispatchDate)/1000;
        personnel_times.push(newPersonnelTime);
        // use earliest to latest and NOT the largest pre-computed time
        // personnel_times.push(_.max(removedTimes));

        // do a bit of cleanup!  we need to remove the nulled values because the
        // length is used to for various counts
        personnel = _.compact(personnel);
        personnel_times = _.compact(personnel_times);
      })
    }

    let apparatus = _.map(incidentRecords, function(v){
      return (v['Apparatus Name']);
    });
    apparatus = _.uniq(apparatus);
    raw_values.personnel_times.push(personnel_times);
    raw_values.personnel.push(personnel);
    raw_values.apparatus.push(apparatus);

    if (SOUTH_STATIONS.some(v => baseRecord['Station'].includes(v))){
      raw_values.call_regions.push('south');
    }else if(NORTH_STATIONS.some(v => baseRecord['Station'].includes(v))){
      raw_values.call_regions.push('north');
    }else if(CENTRAL_STATIONS.some(v => baseRecord['Station'].includes(v))){
      raw_values.call_regions.push('central');
    }else{
      raw_values.call_regions.push('other'); // TODO: in district or out of district?
    }

    //NOTE: order matters; cancelled type is very specific, while downgrade is broad
    if (MEDICAL_TYPES.some(v => incidentTypeCall.startsWith(v))){
      raw_values.incident_types.push('medical_rescue');
    }else if(FIRE_TYPE.some(v => incidentTypeCall.startsWith(v))){
      raw_values.incident_types.push('fire');
    }else if(CANCELLED_TYPES.some(v => incidentTypeCall.startsWith(v))){
      raw_values.incident_types.push('cancelled');
    }else if(DOWNGRADE_TYPES.some(v => incidentTypeCall.startsWith(v))){
      raw_values.incident_types.push('downgraded');
    }else{
      raw_values.incident_types.push('other'); // TODO: in district or out of district?
    }
  });
  logger.debug("processRecords", raw_values)
  return raw_values;
};

const createStats = function(raw_values){
  let callsPerDay = _.values(raw_values.calls_per_day);
  let incidentTimes = _.chain(raw_values.incident_times).flatten().compact().value();
  let stats_output = {
    updated_at: new Date(),
    date_range_from: raw_values.date_range_from,
    date_range_to:   raw_values.date_range_to,
    _comment: 'auto generated; do not manually modify',
    _time_dsc: 'all times are in seconds',
    unit_time_stats: {},
    personnel_stats: {},
    region_stats: {},
    incident_stats: {
      types: {},
      num_incidents_last_365_days: raw_values.total_calls,
      num_incidents: raw_values.in_range_calls,
      num_daytime_incidents: raw_values.daytime_calls,
      num_nighttime_incidents: raw_values.nighttime_calls,
      incident_times:{
        sum: sum(incidentTimes),
        mean: _.round(mean(incidentTimes)),
        median: _.round(median(incidentTimes)),
        min: min(incidentTimes),
        max: max(incidentTimes)
      },
      // TODO: see if we can start to get accurate data from dispatch!
      // marine: 0,
      // in_district: 0,
      // out_district: 0,
      num_overlapping_incidents: raw_values.overlapping_calls_num,
      num_per_day: {
        mean: sum(callsPerDay),
        mean: _.round(mean(callsPerDay)),
        median: _.round(median(callsPerDay)),
        min: min(callsPerDay),
        max: max(callsPerDay)
      }
    }
  }

  let defaultIncidentTypes = {
    medical_rescue: 0,
    fire: 0,
    downgraded: 0,
    cancelled: 0,
    other: 0
  }
  let typeStats = {}
  Object.assign(typeStats, defaultIncidentTypes, stats_output.incident_stats.types, _.countBy(raw_values.incident_types));
  stats_output.incident_stats.types = typeStats;
  new Map([
    ['first_unit_reaction', _.chain(raw_values.reaction_times).flatten().compact().value()],
    ['travel',   _.chain(raw_values.travel_times).flatten().compact().value()],
    ['to_scene', _.chain(raw_values.to_scene_times).flatten().compact().value()],
    ['on_scene', _.chain(raw_values.on_scene_times).flatten().compact().value()],
  ]).forEach((arr,k)=>{
    stats_output.unit_time_stats[k] = {
      sum:  sum(arr),
      mean: _.round(mean(arr)),
      median: _.round(median(arr)),
      min: min(arr),
      max: max(arr)
    }
  });


  let collapsedPersonnelTimes = _.map(raw_values.personnel_times, function(pt){
    return sum(pt);
  });
  let incident = {
    sum:  sum(collapsedPersonnelTimes),
    mean: _.round(mean(collapsedPersonnelTimes)),
    median: _.round(median(collapsedPersonnelTimes)),
    min: min(collapsedPersonnelTimes),
    max: max(collapsedPersonnelTimes)
  };
  stats_output.personnel_stats['time_on_incidents'] = incident;
  let personnelCount = _.map(raw_values.personnel, function(pt){
    return pt.length;
  });
  stats_output.personnel_stats['num_per_incidents'] = {
    mean: _.round(mean(personnelCount), 1),
    median: _.round(median(personnelCount), 1),
    min: min(personnelCount),
    max: max(personnelCount)
  }
  stats_output.personnel_stats['num_unique_responders'] = _.uniq(_.flatten(raw_values.personnel)).length

  let apparatusCount = _.map(raw_values.apparatus, function(a){
    return a.length;
  });
  stats_output.apparatus_stats = {
    num_per_incident: {
      mean: _.round(mean(apparatusCount), 1),
      median: _.round(median(apparatusCount), 1),
      min: min(apparatusCount),
      max: max(apparatusCount)
    },
    num_unique_used: _.without(_.uniq(_.flatten(raw_values.apparatus)), 'POV').length
  }

  let raw_regions = {
    north: [],
    south: [],
    central: [],
    other: []
  }
  raw_values.call_regions.forEach((region, i) => {
    let callType = raw_values.incident_types[i];
    if (!stats_output.region_stats[region]){
      stats_output.region_stats[region] = {}
    }
    if (!stats_output.region_stats[region]['incident_types']){
      stats_output.region_stats[region]['incident_types'] = {}
      stats_output.region_stats[region]['num_incidents'] = 0
      Object.assign(stats_output.region_stats[region]['incident_types'], defaultIncidentTypes)
    }
    stats_output.region_stats[region]['incident_types'][callType] += 1
    stats_output.region_stats[region]['num_incidents'] += 1
    if(raw_values.travel_times[i]) raw_regions[region].push(raw_values.travel_times[i]);
  })
  Object.keys(raw_regions).forEach(region => {
    if(!stats_output.region_stats[region]) return;  // go to next if there are no stats for this region
    let compactedArr = _.chain(raw_regions[region]).flatten().compact().value();
    stats_output.region_stats[region]['unit_travel_time'] = {
      sum:  sum(compactedArr),
      mean: _.round(mean(compactedArr)),
      median: _.round(median(compactedArr)),
      min: min(compactedArr),
      max: max(compactedArr)
    };
  });
  return stats_output;
};


// https://stackoverflow.com/a/563442
Date.prototype.addDays = function(days) {
  var date = new Date(this.valueOf());
  date.setDate(date.getDate() + days);
  return date;
};

//TODO: if the time is < 2 seconds, then there was a mistake!
// const avgTime = (records, fromCol, toCol) => {
//   let times = _.map(records, function(r){
//     let dateDiff = (r[toCol] - r[fromCol])/1000;
//     return (dateDiff < 2) ? null : dateDiff;
//   });
//   times = _.compact(times);
//   return sum(times)/times.length;
// }

const extractTimes = (records, fromCol, toCol) => {
  let fromColIsArr = _.isArray(fromCol);
  let times = _.map(records, function(r){
    let fromVal = null
    if(fromColIsArr){
      _.every(fromCol, function(f){
        if(r[f]){
          fromVal = r[f];
          return false; //break loop; _.every will stop if a false is returned
        }
      })
    }else{
      fromVal = r[fromCol];
    }
    if(!fromVal) return null;
    let dateDiff = (r[toCol] - fromVal)/1000;
    return (dateDiff < 2) ? null : dateDiff;
  });
  return times;
  // times = _.compact(times);
  // return sum(times)/times.length;
}

const findFirst = (vals, fromCol, toCol) => {
  let sortedVals = null;
  if(toCol){
    sortedVals = _.sortBy(vals, toCol);
    sortedVals = _.filter(sortedVals, function(v){
      return v[toCol] - v[fromCol] > 2;
    });
  }else{
    sortedVals = _.sortBy(vals, fromCol);
  }
  sortedVals = _.filter(sortedVals, function(v){
    if (toCol && !Boolean(v[toCol])) return false;
    if (!Boolean(v[fromCol])) return false;
    return true
  });
  return sortedVals[0] ? sortedVals[0] : {};
}

const sum  = arr => arr.reduce((a,b) => a + b, 0);
const mean = arr => sum(arr) / arr.length;
const max  = arr => Math.max(...arr);
const min  = arr => Math.min.apply(Math, arr.map(function(v) { return v == null ? Infinity : v; }));
const median = arr => {
  const mid = Math.floor(arr.length / 2),
    nums = [...arr].sort((a, b) => a - b);
  return arr.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
};

// https://stackoverflow.com/a/563442
Date.prototype.addDays = function(days) {
    var date = new Date(this.valueOf());
    date.setDate(date.getDate() + days);
    return date;
}


// Export it to make it available outside
module.exports.retrieveCSVReport = retrieveCSVReport;
module.exports.parseCSV          = parseCSV;
module.exports.generateStats     = generateStats;
