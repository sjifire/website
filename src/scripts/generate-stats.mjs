#!/usr/bin/env node
/**
 * Generate incident statistics from NERIS data
 * Run: node src/scripts/generate-stats.mjs
 *
 * Required environment variables:
 *   NERIS_CLIENT_ID - OAuth2 client ID
 *   NERIS_CLIENT_SECRET - OAuth2 client secret
 *   NERIS_ENTITY_ID - Fire department NERIS ID (e.g., "FD53055103")
 *
 * Optional:
 *   NERIS_USE_TEST_API - Set to "true" to use test API
 *   STATS_DAYS - Number of days for recent stats (default: 30)
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { NerisClient } from './neris-client.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '..', '_data', 'stats.json');

// Configuration
const STATS_DAYS = parseInt(process.env.STATS_DAYS || '30', 10);

// Region classification based on location
// TODO: Update these coordinates/rules for San Juan Island geography
const REGIONS = {
  central: { name: 'central', lat: [48.52, 48.55], lon: [-123.05, -122.98] },
  north: { name: 'north', lat: [48.55, 48.70], lon: [-123.20, -122.90] },
  south: { name: 'south', lat: [48.40, 48.52], lon: [-123.10, -122.95] },
};

// Incident type mapping from NERIS codes to simplified categories
// TODO: Update based on actual NERIS incident type codes
const INCIDENT_TYPE_MAP = {
  // Fire incidents
  '100': 'fire', '111': 'fire', '112': 'fire', '113': 'fire',
  '114': 'fire', '115': 'fire', '116': 'fire', '117': 'fire',
  '118': 'fire', '120': 'fire', '121': 'fire', '122': 'fire',
  '123': 'fire', '130': 'fire', '131': 'fire', '132': 'fire',
  '140': 'fire', '141': 'fire', '142': 'fire', '143': 'fire',
  '150': 'fire', '151': 'fire', '152': 'fire', '153': 'fire',
  '154': 'fire', '155': 'fire', '160': 'fire', '161': 'fire',
  '162': 'fire', '163': 'fire', '164': 'fire', '170': 'fire',
  '171': 'fire', '172': 'fire', '173': 'fire',
  // Medical/Rescue
  '300': 'medical_rescue', '311': 'medical_rescue', '320': 'medical_rescue',
  '321': 'medical_rescue', '322': 'medical_rescue', '323': 'medical_rescue',
  '324': 'medical_rescue', '331': 'medical_rescue', '340': 'medical_rescue',
  '341': 'medical_rescue', '342': 'medical_rescue', '350': 'medical_rescue',
  '351': 'medical_rescue', '352': 'medical_rescue', '353': 'medical_rescue',
  '354': 'medical_rescue', '355': 'medical_rescue', '356': 'medical_rescue',
  '357': 'medical_rescue', '360': 'medical_rescue', '361': 'medical_rescue',
  '362': 'medical_rescue', '363': 'medical_rescue', '364': 'medical_rescue',
  '365': 'medical_rescue', '370': 'medical_rescue', '371': 'medical_rescue',
  '372': 'medical_rescue', '381': 'medical_rescue',
  // Cancelled/Downgraded typically use 600 series
  '611': 'cancelled', '621': 'cancelled', '622': 'cancelled',
  '631': 'downgraded', '632': 'downgraded', '641': 'downgraded',
  '650': 'downgraded', '651': 'downgraded', '652': 'downgraded',
  '653': 'downgraded', '661': 'cancelled', '671': 'cancelled',
  '672': 'cancelled',
};

/**
 * Calculate statistical measures for an array of numbers
 */
function calculateStats(values) {
  if (!values.length) {
    return { sum: 0, mean: 0, q1: 0, median: 0, q3: 0, min: 0, max: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = Math.round(sum / sorted.length);

  const q1Index = Math.floor(sorted.length * 0.25);
  const medianIndex = Math.floor(sorted.length * 0.5);
  const q3Index = Math.floor(sorted.length * 0.75);

  return {
    sum: Math.round(sum),
    mean,
    q1: Math.round(sorted[q1Index]),
    median: Math.round(sorted[medianIndex]),
    q3: Math.round(sorted[q3Index]),
    min: Math.round(sorted[0]),
    max: Math.round(sorted[sorted.length - 1]),
  };
}

/**
 * Classify incident type from NERIS type code
 */
function classifyIncidentType(typeCode) {
  if (!typeCode) return 'other';
  const code = String(typeCode).substring(0, 3);
  return INCIDENT_TYPE_MAP[code] || 'other';
}

/**
 * Determine region from incident location
 */
function classifyRegion(incident) {
  const lat = incident.latitude || incident.location?.latitude;
  const lon = incident.longitude || incident.location?.longitude;

  if (!lat || !lon) return 'central'; // Default to central if no location

  for (const [name, bounds] of Object.entries(REGIONS)) {
    if (lat >= bounds.lat[0] && lat <= bounds.lat[1] &&
        lon >= bounds.lon[0] && lon <= bounds.lon[1]) {
      return name;
    }
  }
  return 'central'; // Default
}

/**
 * Check if time is during daytime hours (6 AM - 10 PM)
 */
function isDaytime(date) {
  const hour = new Date(date).getUTCHours();
  return hour >= 6 && hour < 22;
}

/**
 * Parse time in seconds from ISO timestamps
 */
function getTimeDiffSeconds(start, end) {
  if (!start || !end) return null;
  const diff = (new Date(end) - new Date(start)) / 1000;
  return diff > 0 ? diff : null;
}

/**
 * Process incidents and generate statistics
 */
function generateStats(incidents, allIncidents) {
  const now = new Date();
  const recentStart = new Date(now);
  recentStart.setDate(recentStart.getDate() - STATS_DAYS);

  // Filter to recent incidents for detailed stats
  const recentIncidents = incidents.filter(i =>
    new Date(i.call_create || i.created_at) >= recentStart
  );

  // Initialize collectors
  const unitTimes = {
    firstUnitReaction: [],
    travel: [],
    toScene: [],
    onScene: [],
  };

  const personnelTimes = [];
  const personnelCounts = [];
  const uniqueResponders = new Set();

  const regionData = {
    central: { incidents: [], travelTimes: [] },
    north: { incidents: [], travelTimes: [] },
    south: { incidents: [], travelTimes: [] },
  };

  const incidentTypes = {
    medical_rescue: 0,
    fire: 0,
    downgraded: 0,
    cancelled: 0,
    other: 0,
  };

  let daytimeCount = 0;
  let nighttimeCount = 0;
  const incidentTimes = [];
  const incidentsPerDay = new Map();
  let overlappingCount = 0;

  const apparatusCounts = [];
  const uniqueApparatus = new Set();

  // Process each incident
  for (const incident of recentIncidents) {
    const callTime = incident.call_create || incident.created_at;
    const type = classifyIncidentType(incident.incident_type || incident.type_code);
    const region = classifyRegion(incident);

    // Incident type counts
    incidentTypes[type]++;

    // Region tracking
    regionData[region].incidents.push(incident);

    // Day/night classification
    if (isDaytime(callTime)) {
      daytimeCount++;
    } else {
      nighttimeCount++;
    }

    // Track incidents per day for overlap detection
    const dayKey = new Date(callTime).toISOString().split('T')[0];
    incidentsPerDay.set(dayKey, (incidentsPerDay.get(dayKey) || 0) + 1);

    // Unit/apparatus times
    // Note: Field names may vary based on actual NERIS schema
    const units = incident.units || incident.apparatus || [];
    apparatusCounts.push(units.length);

    for (const unit of units) {
      if (unit.unit_id || unit.apparatus_id) {
        uniqueApparatus.add(unit.unit_id || unit.apparatus_id);
      }

      // Reaction time: call_create to unit_dispatched
      const reactionTime = getTimeDiffSeconds(callTime, unit.dispatched_at || unit.dispatch_time);
      if (reactionTime) unitTimes.firstUnitReaction.push(reactionTime);

      // Travel time: en_route to arrival
      const travelTime = getTimeDiffSeconds(
        unit.en_route_at || unit.enroute_time,
        unit.arrived_at || unit.arrival_time
      );
      if (travelTime) {
        unitTimes.travel.push(travelTime);
        regionData[region].travelTimes.push(travelTime);
      }

      // To scene: call_create to arrival
      const toSceneTime = getTimeDiffSeconds(callTime, unit.arrived_at || unit.arrival_time);
      if (toSceneTime) unitTimes.toScene.push(toSceneTime);

      // On scene: arrival to clear
      const onSceneTime = getTimeDiffSeconds(
        unit.arrived_at || unit.arrival_time,
        unit.cleared_at || unit.clear_time
      );
      if (onSceneTime) unitTimes.onScene.push(onSceneTime);
    }

    // Personnel tracking
    const personnel = incident.personnel || incident.crew || [];
    personnelCounts.push(personnel.length);

    for (const person of personnel) {
      const personId = person.person_id || person.member_id || person.name;
      if (personId) uniqueResponders.add(personId);

      // Time on incident
      const personTime = getTimeDiffSeconds(
        person.arrived_at || person.start_time,
        person.cleared_at || person.end_time
      );
      if (personTime) personnelTimes.push(personTime);
    }

    // Total incident time
    const incidentTime = getTimeDiffSeconds(
      callTime,
      incident.closed_at || incident.clear_time || incident.last_unit_clear
    );
    if (incidentTime) incidentTimes.push(incidentTime);
  }

  // Count overlapping incidents (more than 1 per day)
  for (const count of incidentsPerDay.values()) {
    if (count > 1) overlappingCount++;
  }

  // Build region stats
  const regionStats = {};
  for (const [name, data] of Object.entries(regionData)) {
    const types = { medical_rescue: 0, fire: 0, downgraded: 0, cancelled: 0, other: 0 };
    for (const incident of data.incidents) {
      const type = classifyIncidentType(incident.incident_type || incident.type_code);
      types[type]++;
    }
    regionStats[name] = {
      incident_types: types,
      num_incidents: data.incidents.length,
      unit_travel_time: calculateStats(data.travelTimes),
    };
  }

  // Calculate date ranges
  const allDates = allIncidents.map(i => new Date(i.call_create || i.created_at));
  const recentDates = recentIncidents.map(i => new Date(i.call_create || i.created_at));

  return {
    updated_at: now.toISOString(),
    date_range_all_from: allDates.length ? new Date(Math.min(...allDates)).toISOString() : null,
    date_range_all_to: allDates.length ? new Date(Math.max(...allDates)).toISOString() : null,
    date_range_from: recentDates.length ? new Date(Math.min(...recentDates)).toISOString() : recentStart.toISOString(),
    date_range_to: recentDates.length ? new Date(Math.max(...recentDates)).toISOString() : now.toISOString(),
    parseWarnings: 0,
    _comment: 'auto generated from NERIS; do not manually modify',
    _time_dsc: 'all times are in seconds',
    unit_time_stats: {
      first_unit_reaction: calculateStats(unitTimes.firstUnitReaction),
      travel: calculateStats(unitTimes.travel),
      to_scene: calculateStats(unitTimes.toScene),
      on_scene: calculateStats(unitTimes.onScene),
    },
    personnel_stats: {
      time_on_incidents: calculateStats(personnelTimes),
      num_per_incidents: {
        ...calculateStats(personnelCounts),
        mean: personnelCounts.length ?
          Math.round(personnelCounts.reduce((a, b) => a + b, 0) / personnelCounts.length * 10) / 10 : 0,
      },
      num_unique_responders: uniqueResponders.size,
    },
    region_stats: regionStats,
    incident_stats: {
      types: incidentTypes,
      num_incidents_last_365_days: allIncidents.length,
      num_incidents: recentIncidents.length,
      num_daytime_incidents: daytimeCount,
      num_nighttime_incidents: nighttimeCount,
      incident_times: calculateStats(incidentTimes),
      num_overlapping_incidents: overlappingCount,
      num_per_day: {
        ...calculateStats([...incidentsPerDay.values()]),
        sum: recentIncidents.length,
      },
    },
    apparatus_stats: {
      num_per_incident: {
        ...calculateStats(apparatusCounts),
        mean: apparatusCounts.length ?
          Math.round(apparatusCounts.reduce((a, b) => a + b, 0) / apparatusCounts.length * 10) / 10 : 0,
      },
      num_unique_used: uniqueApparatus.size,
    },
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('NERIS Stats Generator');
  console.log('=====================');

  // Validate environment
  const clientId = process.env.NERIS_CLIENT_ID;
  const clientSecret = process.env.NERIS_CLIENT_SECRET;
  const entityId = process.env.NERIS_ENTITY_ID;

  if (!clientId || !clientSecret || !entityId) {
    console.error('Missing required environment variables:');
    if (!clientId) console.error('  - NERIS_CLIENT_ID');
    if (!clientSecret) console.error('  - NERIS_CLIENT_SECRET');
    if (!entityId) console.error('  - NERIS_ENTITY_ID');
    process.exit(1);
  }

  const useTestApi = process.env.NERIS_USE_TEST_API === 'true';
  console.log(`Using ${useTestApi ? 'TEST' : 'PRODUCTION'} API`);
  console.log(`Entity ID: ${entityId}`);
  console.log(`Stats period: ${STATS_DAYS} days`);

  // Initialize client
  const client = new NerisClient({
    clientId,
    clientSecret,
    useTestApi,
  });

  // Fetch incidents from last 365 days for yearly stats
  const yearAgo = new Date();
  yearAgo.setDate(yearAgo.getDate() - 365);

  console.log(`\nFetching incidents since ${yearAgo.toISOString().split('T')[0]}...`);

  const allIncidents = [];
  let count = 0;

  for await (const incident of client.fetchAllIncidents({
    entityId,
    callCreateStart: yearAgo.toISOString(),
    pageSize: 100,
    sortBy: 'call_create',
    sortDirection: 'DESCENDING',
  })) {
    allIncidents.push(incident);
    count++;
    if (count % 100 === 0) {
      console.log(`  Fetched ${count} incidents...`);
    }
  }

  console.log(`Total incidents fetched: ${allIncidents.length}`);

  // Generate statistics
  console.log('\nGenerating statistics...');
  const stats = generateStats(allIncidents, allIncidents);

  // Write output
  console.log(`\nWriting to ${OUTPUT_PATH}...`);
  await writeFile(OUTPUT_PATH, JSON.stringify(stats, null, 2) + '\n');

  console.log('\nStats summary:');
  console.log(`  Total incidents (365 days): ${stats.incident_stats.num_incidents_last_365_days}`);
  console.log(`  Recent incidents (${STATS_DAYS} days): ${stats.incident_stats.num_incidents}`);
  console.log(`  Unique responders: ${stats.personnel_stats.num_unique_responders}`);
  console.log(`  Unique apparatus: ${stats.apparatus_stats.num_unique_used}`);

  console.log('\nDone!');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
