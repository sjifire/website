#!/usr/bin/env node
'use strict';
const fs = require('fs');


const USERNAME = process.env.ESO_REPORT_USERNAME;
const PASSWORD = process.env.ESO_REPORT_PASSWORD;
const AGENCY   = 'sjifr';
const REPORT_NAME   = 'website-2';
const OUTPUT_JSON_FILENAME = './src/_data/stats.json'

const SOUTH_STATIONS   = ["32", "33"];
const CENTRAL_STATIONS = ["31", "36"];
const NORTH_STATIONS   = ["34", "35"];

const MEDICAL_TYPES    = ['3']; // Medical & Rescue
const FIRE_TYPE        = ['1', '4', '5']; // fire, hazard, backfill
const CANCELLED_TYPES  = ['61']
const DOWNGRADE_TYPES  = ['6', '7']

const ESO_TIMEOUT   = 600000; //the report can take a LONG time to generate;
const ESO_LOGIN_URL = 'https://www.esosuite.net/login';


const retrieveCSVReport = async function(){
  const os = require('os');
  const path = require('path');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromium'));

  const { chromium } = require('playwright');
  const context = await chromium.launchPersistentContext(userDataDir, { headless: true, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(ESO_LOGIN_URL);

  // Interact with login form
  await page.fill('input[name="username"]', USERNAME);
  await page.fill('input[name="password"]', PASSWORD);
  await page.fill('input[name="agency"]',  AGENCY)
  await page.click('button[type="submit"]');

  await page.click('text=Ad-Hoc');

  const [reportPage] = await Promise.all([
    context.waitForEvent('page'),
    page.click('text=' + REPORT_NAME) // Opens a new tab
  ])
  //wait for report to finish displaying
  await reportPage.waitForLoadState('networkidle', {timeout: ESO_TIMEOUT});
  const [ download ] = await Promise.all([
    // Start waiting for the download
    reportPage.waitForEvent('download', {timeout: ESO_TIMEOUT}),
    // Perform the action that initiates download
    reportPage.click('#CSV', {timeout: ESO_TIMEOUT})
  ]);
  // Wait for the download process to complete
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
    trim: true
  });

  // cleanup record oddities
  records.forEach(record => {
    let d = record['Incident Date'].replace(' 12:00:00 AM', '')
    record['Incident Date'] = new Date(record['Incident Date'])
    record['Last Unit Cleared Date'] = new Date(record['Last Unit Cleared Date'])
    record['Is Cancelled Prior To Arrival'] = record['Is Cancelled Prior To Arrival'] !== 'NA';
    Object.keys(record).forEach((key)=>{
      if(key.toLocaleLowerCase().endsWith(" date") && typeof(record[key]) === 'string'){
        record[key] = new Date(`${d} ${record[key]}`);
      }else if(key.toLocaleLowerCase().endsWith(" count") && record[key] === ''){
        record[key] = 0;
      }
    })
  });
  // sort by early to latest; and sort by the time dispatch pages us, NOT when
  // dispatch received the call as they don't always page in the same order
  records.sort((a, b) => (a['Dispatched Date'] > b['Dispatched Date']) ? 1 : -1)
  return records;
};

const processRecords = function(records){
  let raw_values={
    reaction_times: [],
    travel_times: [],
    to_scene_times: [],
    on_scene_times: [],
    incident_times: [],
    num_personnel_on_incidents: [],
    num_apparatus_on_incidents: [],
    call_regions: [],
    call_types: [],
    overlapping_calls_num: 0,
    total_calls: records.length
  }
  //TODO: do we want to record oddities in the data, like negative times, or zero times?
  let prev_call_end   = null;
  records.forEach(record => {
    let dispatched_time = record['Dispatched Date']
    if(prev_call_end && prev_call_end > dispatched_time){
      dispatched_time = prev_call_end
      raw_values.overlapping_calls_num += 1
    }
    processTime(record['En Route Date'], dispatched_time, raw_values.reaction_times);
    processTime(record['Arrival Date'], record['En Route Date'], raw_values.travel_times);
    processTime(record['Arrival Date'], record['Dispatched Date'], raw_values.to_scene_times);
    processTime(record['Last Unit Cleared Date'], record['Arrival Date'], raw_values.on_scene_times);
    processTime(record['Last Unit Cleared Date'], dispatched_time, raw_values.incident_times);
    prev_call_end = record['Last Unit Cleared Date'];

    raw_values.num_personnel_on_incidents.push(record['Suppression Personnel Count'] + record['EMS Personnel Count'] + record['Other Personnel Count']);
    raw_values.num_apparatus_on_incidents.push(record['Suppression Apparatus Count'] + record['EMS Apparatus Count'] + record['Other Apparatus Count']);

    if (SOUTH_STATIONS.some(v => record['Station'].includes(v))){
      raw_values.call_regions.push('south');
    }else if(NORTH_STATIONS.some(v => record['Station'].includes(v))){
      raw_values.call_regions.push('north');
    }else if(CENTRAL_STATIONS.some(v => record['Station'].includes(v))){
      raw_values.call_regions.push('central');
    }else{
      raw_values.call_regions.push('other'); // TODO: in district or out of district?
    }

    //NOTE: order matters; cancelled type is very specific, while downgrade is broad
    let incidentTypeCall = record['Incident Type Code'].toString();
    if (MEDICAL_TYPES.some(v => incidentTypeCall.startsWith(v))){
      raw_values.call_types.push('medical_rescue');
    }else if(FIRE_TYPE.some(v => incidentTypeCall.startsWith(v))){
      raw_values.call_types.push('fire');
    }else if(CANCELLED_TYPES.some(v => incidentTypeCall.startsWith(v))){
      raw_values.call_types.push('cancelled');
    }else if(DOWNGRADE_TYPES.some(v => incidentTypeCall.startsWith(v))){
      raw_values.call_types.push('downgraded');
    }else{
      raw_values.call_types.push('other'); // TODO: in district or out of district?
    }
  });
  return raw_values;
};

const createStats = function(raw_values){
  let stats_output = {
    updated_at: new Date(),
    time_stats: {},
    personnel_stats: {},
    region_stats: {},
    call_stats: {
      total: raw_values.total_calls,
      // TODO: see if we can start to get accurate data from dispatch!
      // marine: 0,
      // in_district: 0,
      // out_district: 0,
      overlapping_num_calls: raw_values.overlapping_calls_num
    }
  }

  let defaultCallStats = {
    medical_rescue: 0,
    fire: 0,
    total: 0,
    downgraded: 0,
    cancelled: 0,
    other: 0
  }

  let callTypes = raw_values.call_types.reduce(function (acc, curr) {
    return acc[curr] ? ++acc[curr] : acc[curr] = 1, acc
  }, {});
  let callStats = {}
  Object.assign(callStats, defaultCallStats, stats_output.call_stats, callTypes);
  stats_output.call_stats = callStats;
  new Map([
    ['reaction', raw_values.reaction_times],
    // ['travel', raw_values.travel_times],
    // ['to_scene', raw_values.to_scene_times],
    ['on_scene', raw_values.on_scene_times]
    // ['total_incident', raw_values.incident_times]
  ]).forEach((arr,k)=>{
    stats_output.time_stats[k] = {
      // sum:  findSum(arr),
      mean: findMean(arr)
      // median: findMedian(arr),
      // min: findMin(arr),
      // max: findMax(arr)
    }
  });

  raw_values.num_personnel_on_incidents.forEach((num, i) => {
    let modified_incident_times = raw_values.incident_times.map(function(x) { return  ((x !== null) ? x * num : null); });
    let incident = {
      sum:  findSum(modified_incident_times),
      mean: findMean(modified_incident_times)
      // median: findMedian(modified_incident_times),
      // min: findMin(modified_incident_times),
      // max: findMax(modified_incident_times)
    };
    stats_output.personnel_stats['time_on_incident'] = incident;
  })

  stats_output.personnel_stats['number_per_incident'] = {
    mean: findMean(raw_values.num_personnel_on_incidents),
    // median: findMedian(raw_values.num_personnel_on_incidents),
    min: findMin(raw_values.num_personnel_on_incidents),
    max: findMax(raw_values.num_personnel_on_incidents)
  }

  // stats_output.apparatus_stats = {
  //   per_incident: {
  //     mean: findMean(raw_values.num_apparatus_on_incidents),
  //     median: findMedian(raw_values.num_apparatus_on_incidents),
  //     min: findMin(raw_values.num_apparatus_on_incidents),
  //     max: findMax(raw_values.num_apparatus_on_incidents)
  //   }
  // }

  let raw_regions = {
    north: [],
    south: [],
    central: []
  }
  raw_values.call_regions.forEach((region, i) => {
    // let callType = raw_values.call_types[i];
    if (!stats_output.region_stats[region]){
      stats_output.region_stats[region] = {}
    }
    // if (!stats_output.region_stats[region]['call_types']){
    //   stats_output.region_stats[region]['call_types'] = {}
    //   Object.assign(stats_output.region_stats[region]['call_types'], defaultCallStats)
    // }
    // stats_output.region_stats[region]['call_types'][callType] += 1
    // stats_output.region_stats[region]['call_types']['total'] += 1
    if(raw_values.travel_times[i]) raw_regions[region].push(raw_values.travel_times[i]);
  })

  Object.keys(raw_regions).forEach(region => {
    stats_output.region_stats[region]['travel'] = {
      // sum:  findSum(raw_regions[region]),
      mean: findMean(raw_regions[region])
      // median: findMedian(raw_regions[region]),
      // min: findMin(raw_regions[region]),
      // max: findMax(raw_regions[region])
    };
  });
  return stats_output;
};
// stats helper methods

//TODO: if the time is < 2 seconds, then there was a mistake!
const processTime = function(date1, date2, addToArr){
  let dateDiff = (date1 - date2)/1000;
  if(dateDiff <= 2) dateDiff = null;
  // if(max_limit && dateDiff >= ) dateDiff = null;
  addToArr.push(dateDiff);
}

const findSum  = arr => arr.reduce((a,b) => a + b, 0);
const findMean = arr => arr.reduce((a,b) => a + b, 0) / arr.length;
const findMax  = arr => Math.max(...arr);
const findMin  = arr => Math.min.apply(Math, arr.map(function(v) { return v == null ? Infinity : v; }));
const findMedian = arr => {
  const mid = Math.floor(arr.length / 2),
    nums = [...arr].sort((a, b) => a - b);
  return arr.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
};


(async function(){
  console.log("retrieving CSV report from ESO")
  let csvPath = await retrieveCSVReport();
  console.log("parsing CSV report")
  let records = parseCSV(csvPath);
  let raw_values   = processRecords(records);
  console.log("generating stats")
  let stats_output = createStats(raw_values);
  console.log(`outputing json file to ${OUTPUT_JSON_FILENAME}`)
  let json = JSON.stringify(stats_output, null, 2);
  fs.writeFileSync(OUTPUT_JSON_FILENAME, json)
})()

