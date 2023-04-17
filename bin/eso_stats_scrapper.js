#!/usr/bin/env node
"use strict";
/**
 * script which logs in and retrieves data from an
 * ESO report, then parses into a stats JSON file.
 *
 */
const fs = require("fs");
require("dotenv").config();

const logger = require("../src/modules/logger");
const _ = require("lodash");

const { hideBin } = require("yargs/helpers");
const esoScrapper = require("../src/modules/eso_scrapper");

const USERNAME = process.env.ESO_REPORT_USERNAME;
const PASSWORD = process.env.ESO_REPORT_PASSWORD;
const AGENCY = process.env.ESO_REPORT_AGENCY;

const argv = require("yargs/yargs")(hideBin(process.argv))
  .usage("Usage: $0 -o [file path]")
  .option("output", {
    alias: "o",
    description: "JSON output file path",
  })
  .option("report_name", {
    alias: "r",
    description: "ESO Report Name",
  })
  .option("csv_output", {
    alias: "c",
    description: "CSV output file path",
  })
  .option("csv_input", {
    description: "CSV input file path",
  })
  .option("headless", {
    description: "run in headless mode",
    type: "boolean",
    default: false,
  })
  .option("day_range", {
    description: "how many days to run detailed analysis on",
    type: "integer",
    default: 30,
  })
  .option("stop_date", {
    description: "when to stop detailed analysis",
  })
  .option("start_date", {
    description: "when to start detailed analysis",
  })
  .count("verbose")
  .alias("v", "verbose")
  .demandOption(["o"])
  .help()
  .alias("help", "h").argv;

switch (argv.verbose) {
  case 0:
    logger.level = "info";
    break;
  case 1:
    logger.level = "verbose";
    break;
  default:
    logger.level = "debug";
}

let csvPath = argv.csv_input;
if (_.isUndefined(csvPath) && _.isUndefined(argv.r)) {
  throw new Error("Missing required argument: --report_name");
}

(async function () {
  if (_.isUndefined(csvPath)) {
    logger.info("retrieving CSV report from ESO");
    csvPath = await esoScrapper.retrieveCSVReport(
      USERNAME,
      PASSWORD,
      AGENCY,
      argv.r,
      argv.headless
    );
  }

  if (!_.isUndefined(argv.c)) {
    logger.info(`outputing csv file to ${argv.c}`);
    fs.copyFileSync(csvPath, argv.c);
  }

  logger.info("parsing CSV report");
  const records = esoScrapper.parseCSV(csvPath);

  const statsOutput = esoScrapper.generateStats({
    records: records,
    startDate: argv.start_date,
    stopDate: argv.stop_date,
    dayRange: argv.day_range,
  });
  logger.info(
    `incidents: ${statsOutput.incident_stats.num_incidents} (curr date range); ${statsOutput.incident_stats.num_incidents_last_365_days} (last 365)`
  );
  logger.info(
    `date range:      ${statsOutput.date_range_from.toLocaleDateString()} -> ${statsOutput.date_range_to.toLocaleDateString()} (${Math.round(
      (statsOutput.date_range_to.getTime() -
        statsOutput.date_range_from.getTime()) /
        (1000 * 3600 * 24)
    )} days)`
  );
  logger.info(
    `full date range: ${statsOutput.date_range_all_from.toLocaleDateString()} -> ${statsOutput.date_range_all_to.toLocaleDateString()} (${Math.round(
      (statsOutput.date_range_all_to.getTime() -
        statsOutput.date_range_all_from.getTime()) /
        (1000 * 3600 * 24)
    )} days)`
  );
  logger.info(`outputing json file to ${argv.o}`);
  const json = JSON.stringify(statsOutput, null, 2);
  fs.writeFileSync(argv.o, json);
})();
