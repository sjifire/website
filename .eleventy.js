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
    // Assumes this is receiving a collection, hence the `data`
    // If custom array such as from _data, update accordingly
    return arr.filter((item) => selections.includes(item[attr]));
  });

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
