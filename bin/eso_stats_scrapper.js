#!/usr/bin/env node
'use strict';
/**
 * script which logs in and retrieves data from an
 * ESO report, then parses into a stats JSON file.
 *
 */
const fs     = require('fs');
const yargs  = require('yargs');
const logger = require('../src/modules/logger');
const _      = require('lodash');

const { hideBin } = require('yargs/helpers');
const esoScrapper = require( "../src/modules/eso_scrapper" );

const USERNAME = process.env.ESO_REPORT_USERNAME;
const PASSWORD = process.env.ESO_REPORT_PASSWORD;
const AGENCY   = process.env.ESO_REPORT_AGENCY;

var argv = require('yargs/yargs')(hideBin(process.argv))
    .usage('Usage: $0 -o [file path]')
    .option('output', {
        alias: 'o',
        description: 'JSON output file path'
    })
    .option('report_name', {
        alias: 'r',
        description: 'ESO Report Name'
    })
    .option('csv_output', {
        alias: 'c',
        description: 'CSV output file path'
    })
    .option('csv_input', {
        description: 'CSV input file path'
    })
    .option('headless', {
        description: 'run in headless mode',
        type: 'boolean',
        default: false
    })
    .option('day_range', {
        description: 'how many days to run detailed analysis on',
        type: 'integer',
        default: 30
    })
    .option('stop_date', {
        description: 'when to stop detailed analysis'
    })
    .option('start_date', {
        description: 'when to start detailed analysis'
    })
    .count('verbose')
    .alias('v', 'verbose')
    .demandOption(['o','r'])
    .help()
    .alias('help', 'h')
    .argv;

  switch(argv.verbose) {
    case 0:
      logger.level = 'info';
      break;
    case 1:
      logger.level = 'verbose';
      break;
    default:
      logger.level = 'debug';
    }

(async function(){

  let csvPath = argv.csv_input;
  if(_.isUndefined(csvPath)){
    logger.info("retrieving CSV report from ESO");
    csvPath = await esoScrapper.retrieveCSVReport(USERNAME, PASSWORD, AGENCY, argv.r, argv.headless);
  }

  if(argv.c){
    logger.info(`outputing csv file to ${argv.c}`);
    fs.copyFileSync(csvPath, argv.c);
  }

  logger.info("parsing CSV report");
  let records = esoScrapper.parseCSV(csvPath);

  let statsOutput = esoScrapper.generateStats({
    records: records,
    start_date: argv.start_date,
    stop_date: argv.stop_date,
    day_range: argv.day_range});
  logger.info(`outputing json file to ${argv.o}`);
  let json = JSON.stringify(statsOutput, null, 2);
  fs.writeFileSync(argv.o, json);
})()

