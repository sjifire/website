#!/usr/bin/env node
'use strict';
const fs = require('fs');
const yargs = require('yargs');
const path = require('path');
const { hideBin } = require('yargs/helpers')
const esoScraper = require( "../src/modules/eso_scraper" );

const USERNAME = process.env.ESO_REPORT_USERNAME;
const PASSWORD = process.env.ESO_REPORT_PASSWORD;
const AGENCY   = 'sjifr';
const REPORT_NAME   = 'website-2';
// const OUTPUT_JSON_FILENAME = './src/_data/stats.json'

var argv = require('yargs/yargs')(hideBin(process.argv))
    .usage('Usage: $0 -o [file path]')
    .option('output', {
        alias: 'o',
        description: 'JSON output file path'
    })
    .option('csv_output', {
        alias: 'c',
        description: 'CSV output file path'
    })
    .option('headless', {
        description: 'run in headless mode',
        type: 'boolean',
        default: false
    })
    .demandOption(['o'])
    .help()
    .alias('help', 'h')
    .argv;


(async function(){
  console.log("retrieving CSV report from ESO")
  let csvPath = await esoScraper.retrieveCSVReport(USERNAME, PASSWORD, AGENCY, REPORT_NAME, argv.h);
  console.log("parsing CSV report")
  if(argv.c){
    console.log(`outputing csv file to ${argv.c}`)
    fs.copyFileSync(csvPath, argv.c);
  }
  let records = esoScraper.parseCSV(csvPath);
  let statsOutput = esoScraper.generateStats(records);
  console.log(`outputing json file to ${argv.o}`)
  let json = JSON.stringify(statsOutput, null, 2);
  fs.writeFileSync(argv.o, json)
})()

