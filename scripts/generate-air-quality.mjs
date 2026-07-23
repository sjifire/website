#!/usr/bin/env node
/**
 * Generate current air quality data from AirNow (EPA)
 *
 * Fetches the current observed Air Quality Index (AQI) for the nearest
 * reporting monitor to Friday Harbor and writes src/_data/air_quality.json.
 *
 * AirNow (airnow.gov) is the authoritative U.S. air quality source, run by the
 * EPA in partnership with NOAA, the WA Dept. of Ecology, and local agencies.
 * PM2.5 is the pollutant that tracks wildfire smoke.
 *
 * NOTE: San Juan Island has no permanent EPA monitor, so AirNow returns the
 * nearest reporting station (often Anacortes, ~20 mi away). The reporting area
 * name is stored so the widget can be transparent about the source. For live,
 * hyperlocal smoke coverage the widget also links to the AirNow Fire & Smoke
 * Map, which blends official monitors with the county's PurpleAir sensors.
 *
 * Secrets (environment variables):
 *   AIRNOW_API_KEY - Free API key from https://docs.airnowapi.org/
 *
 * CLI:
 *   npm run air-quality
 */

import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ============================================================================
// Configuration
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "..", "src", "_data", "air_quality.json");

// Friday Harbor, San Juan Island
const LATITUDE = 48.5343;
const LONGITUDE = -123.017;
// Search radius (miles) — wide enough to reach the nearest reporting monitor
const SEARCH_DISTANCE = 75;

const API_KEY = process.env.AIRNOW_API_KEY;

// Live map centered on the San Juan Islands (smoke plume coverage + sensors)
const FIRE_AND_SMOKE_MAP_URL = `https://fire.airnow.gov/#8/${LATITUDE}/${LONGITUDE}`;

// ============================================================================
// Fetch
// ============================================================================

async function fetchCurrentObservations() {
  const url =
    "https://www.airnowapi.org/aq/observation/latLong/current/" +
    `?format=application/json&latitude=${LATITUDE}&longitude=${LONGITUDE}` +
    `&distance=${SEARCH_DISTANCE}&API_KEY=${API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`AirNow API returned ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  if (!API_KEY) {
    console.error(
      "::error::Missing AIRNOW_API_KEY. Get a free key at https://docs.airnowapi.org/",
    );
    process.exit(1);
  }

  let observations;
  try {
    observations = await fetchCurrentObservations();
  } catch (err) {
    // Don't clobber the last good reading on a transient API failure — the
    // widget shows the previous value (with its timestamp) until the next run.
    console.error(`::warning::Could not fetch AirNow data: ${err.message}`);
    console.error("Leaving existing air_quality.json unchanged.");
    return;
  }

  if (!Array.isArray(observations) || observations.length === 0) {
    console.warn("No AirNow observations returned for the search area. Skipping.");
    return;
  }

  // AirNow returns one entry per pollutant (O3, PM2.5, PM10). The headline AQI
  // is the highest value across reported pollutants.
  const primary = observations.reduce((worst, obs) =>
    obs.AQI > worst.AQI ? obs : worst,
  );

  const data = {
    aqi: primary.AQI,
    category: primary.Category?.Name ?? null,
    pollutant: primary.ParameterName ?? null,
    reporting_area: primary.ReportingArea ?? null,
    updated: new Date().toISOString(),
    source_url: FIRE_AND_SMOKE_MAP_URL,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(data, null, 2) + "\n");
  console.log(
    `Air quality: AQI ${data.aqi} (${data.category}) — ${data.pollutant} via ${data.reporting_area}`,
  );
}

main().catch((err) => {
  console.error(`::error::${err.message}`);
  process.exit(1);
});
