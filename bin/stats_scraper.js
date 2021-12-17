#!/usr/bin/env node
'use strict';

const yargs = require('yargs');
const axios   = require("axios");
const cheerio = require("cheerio");
const pretty  = require("pretty");
const fs      = require("fs");

// URL of the page we want to scrape
const url = "https://en.wikipedia.org/wiki/ISO_3166-1_alpha-3";


// const argv = yargs
//     .command('stats_scraper', 'retrieves stats from ESO and outputs them as json', {
//         year: {
//             description: 'the year to check for',
//             alias: 'y',
//             type: 'number',
//         }
//     })
//     .option('time', {
//         alias: 't',
//         description: 'Tell the present Time',
//         type: 'boolean',
//     })
//     .help()
//     .alias('help', 'h')
//     .argv;
var argv = require('yargs/yargs')(process.argv.slice(2)).argv;
console.log(argv);

var argv = require('yargs/yargs')(process.argv.slice(2))
    .usage('Usage: $0 -w [num] -h [num]')
    .demandOption(['w','h'])
    .argv;

// demand non-hyphenated args
// var argv = require('yargs/yargs')(process.argv.slice(2))
//     .demandCommand(2)
//     .argv;
// console.dir(argv);
// console.log("The area is:", argv.w * argv.h);


// defaults
// var argv = require('yargs/yargs')(process.argv.slice(2))
//     .default({ x : 10, y : 10 })
//     .argv
// ;
// console.log(argv.x + argv.y);
// var argv = require('yargs/yargs')(process.argv.slice(2))
//     .count('verbose')
//     .alias('v', 'verbose')
//     .argv;

// VERBOSE_LEVEL = argv.verbose;

// function WARN()  { VERBOSE_LEVEL >= 0 && console.log.apply(console, arguments); }
// function INFO()  { VERBOSE_LEVEL >= 1 && console.log.apply(console, arguments); }
// function DEBUG() { VERBOSE_LEVEL >= 2 && console.log.apply(console, arguments); }

// WARN("Showing only important stuff");
// INFO("Showing semi-important stuff too");
// DEBUG("Extra chatty mode");


process.env.USER_ID
 return;
// let args = minimist(process.argv.slice(2), {
//     default: {
//         port: 8080
//     },
//      alias: {
//         h: 'help',
//         v: 'version'
//     }
// });

console.log('argv:', argv);
const jsonOutputFile = process.argv[2];

// Async function which scrapes the data
async function scrapeData() {
  try {// Fetch HTML of the page we want to scrape
	const { data } = await axios.get(url);

	// Load HTML we fetched in the previous line
	const $ = cheerio.load(data);
	// Select all the list items in plainlist class
	const listItems = $(".plainlist ul li");
	// Stores data for all countries
    // Stores data for all countries
    const countries = [];
    // Use .each method to loop through the li we selected
    listItems.each((idx, el) => {
      // Object holding data for each country/jurisdiction
      const country = { name: "", iso3: "" };
      // Select the text content of a and span elements
      // Store the textcontent in the above object
      country.name = $(el).children("a").text();
      country.iso3 = $(el).children("span").text();
      // Populate countries array with country data
      countries.push(country);
    });
    // Logs countries array to the console
    console.dir(countries);
    // Write countries array in countries.json file
    fs.writeFile("countries.json", JSON.stringify(countries, null, 2), (err) => {
      if (err) {
        console.error(err);
        return;
      }
      console.log("Successfully written data to file");
    });
  } catch (err) {
    console.error(err);
  }
}
// Invoke the above function
scrapeData();

