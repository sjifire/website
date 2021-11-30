const { DateTime } = require("luxon");
const CleanCSS = require("clean-css");
const util = require("util");
const slugify = require("slugify");

module.exports = function (eleventyConfig) {
  require("dotenv").config();

  eleventyConfig.addPassthroughCopy("./src/assets/");

  eleventyConfig.addFilter("limit", function (arr, limit) {
    return arr.slice(0, limit);
  });

  eleventyConfig.addFilter("cssmin", function (code) {
    return new CleanCSS({}).minify(code).styles;
  });

  // Slugify
  eleventyConfig.addFilter("slugify", function (str) {
    return slugify(str, {
      lower: true,
      replacement: "-",
      remove: /[*+~.·,()'"`´%!?¿:@]/g,
    });
  });

  eleventyConfig.addFilter("postDateTerse", (dateObj) => {
    return DateTime.fromJSDate(dateObj).toLocaleString(DateTime.DATE_MED);
  });
  
  eleventyConfig.addFilter("postDateVerbose", (dateObj) => {
    return DateTime.fromJSDate(dateObj).toLocaleString(DateTime.DATE_HUGE);
  });

  eleventyConfig.addFilter("machineDate", (dateObj) => {
    return DateTime.fromJSDate(dateObj).toISO(DateTime.DATE_FULL);
  });

  eleventyConfig.addFilter("htmlDateString", (dateObj) => {
    return DateTime.fromJSDate(dateObj).toFormat('yyyy-LL-dd');
  });

  eleventyConfig.addFilter("yearOnly", (dateObj) => {
    return DateTime.fromJSDate(dateObj).toFormat('yyyy');
  });

  eleventyConfig.addFilter("timeJSSimple", (dateObj) => {
    return DateTime.fromJSDate(dateObj).toLocaleString(DateTime.TIME_SIMPLE);
  });

  eleventyConfig.addFilter("dump", (obj) => {
    return util.inspect(obj);
  });

  return {
    dir: {
      input: "src",
      output: "public",
    },
  };
};
