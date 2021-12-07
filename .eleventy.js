const { DateTime } = require("luxon");
const CleanCSS = require("clean-css");
const util = require("util");
const TurndownService = require('turndown')
const slugify = require("slugify");

module.exports = function (eleventyConfig) {
  require("dotenv").config();

  eleventyConfig.addPassthroughCopy("src/assets/");

  eleventyConfig.addFilter("limit", function (arr, limit) {
    return arr.slice(0, limit);
  });

  eleventyConfig.addFilter("cssmin", function (code) {
    return new CleanCSS({}).minify(code).styles;
  });

  eleventyConfig.setDataDeepMerge(true);
  
  eleventyConfig.addFilter("pluck", function (arr, selections, attr) {
    return arr.filter((item) => selections.includes(item[attr]));
  });

  eleventyConfig.addFilter("exclude", function (arr, selections, attr) {
    return arr.filter((item) => !selections.includes(item[attr]));
  });

  const now = new Date().getTime();
  const hidePastItems = (event) => {
    if (now < new Date(event.date).getTime()) return false;
    return true;
  }
  const hideFutureItems = (event) => {
    if (now > new Date(event.date).getTime()) return false;
    return true;
  }
  eleventyConfig.addCollection("pastMeetings", (collection) => {
    const allMeetings = collection.getAll()[0].data.meetings;
    return allMeetings
      .filter(hidePastItems)
      .reverse();
  });

  eleventyConfig.addCollection("futureMeetings", (collection) => {
    const allMeetings = collection.getAll()[0].data.meetings;
    return allMeetings
      .filter(hideFutureItems)
  });

  // eleventyConfig.addCollection("customDataCollection", (collection) => {
  //   const allItems = collection.getAll()[0].data.customData;
  
  //   // Filter or use another method to select the items you want
  //   // for the collection
  //   return allItems.filter((item) => {
  //     // ...
  //   });
  // });

  // eleventyConfig.addShortcode("meetingsByYear2", (data=[], year="") => {
  //   return data.filter(event => new Date(event.date).getFullYear() === parseInt(year, 10))
  //     .map(event => `<div><p>${event.title} at ${event.date}</p></div>`)
  //     .join("\n");
  // });

  const MarkdownIt = require("markdown-it");
  const mdRender = new MarkdownIt();
  eleventyConfig.addFilter("markdownify", function(rawString) {
    return mdRender.render(rawString);
  });

  // Slugify
  eleventyConfig.addFilter("slugify", function (str) {
    return slugify(str, {
      lower: true,
      replacement: "-",
      remove: /[*+~.·,()'"`´%!?¿:@]/g,
    });
  });

  eleventyConfig.addFilter("postDateTerseISO", (dateObj) => {
    return DateTime.fromISO(dateObj, {zone: 'utc'}).toLocaleString(DateTime.DATE_MED);
  });
  
  eleventyConfig.addFilter("postDateVerboseISO", (dateObj) => {
    return DateTime.fromISO(dateObj, {zone: 'utc'}).toLocaleString(DateTime.DATE_HUGE);
  });

  eleventyConfig.addFilter("htmlDateStringISO", (dateObj) => {
    return DateTime.fromISO(dateObj, {zone: 'utc'}).toFormat('yyyy-LL-dd');
  });
  
  eleventyConfig.addFilter("yearOnlyJS", (dateObj) => {
    return DateTime.fromJSDate(dateObj, {zone: 'utc'}).toFormat('yyyy');
  });
  
  eleventyConfig.addFilter("dump", (obj) => {
    return util.inspect(obj);
  });

  const turndownService = new TurndownService()
  eleventyConfig.addFilter('turndown', obj => {
    return turndownService.turndown(obj).trim()
  });

  return {
    dir: {
      input: "src",
      output: "public",
    },
  };
};
