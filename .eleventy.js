const htmlmin      = require("html-minifier");
const { DateTime } = require("luxon");
const CleanCSS     = require("clean-css");
const util         = require("util");
const slugify      = require("slugify");
const yaml         = require("js-yaml");

const isProduction = process.env.ELEVENTY_ENV === `production`;

module.exports = function (eleventyConfig) {
  require("dotenv").config();

  eleventyConfig.addDataExtension("yml", contents => yaml.load(contents));

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

  const now = new Date();
  const nowPlus24 = now.setHours(now.getHours()-29);
  const hidePastItems = (event) => {
    if (nowPlus24 < new Date(event.date).getTime()) return false; //.setHours(datetime.getHours()+1)
    return true;
  }
  const hideFutureItems = (event) => {
    if (nowPlus24 > new Date(event.date).getTime()) return false;
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

  // const MarkdownIt = require("markdown-it");
  //FIXME: Remark is not easily supported in 11ty at the moment
  //       once it is, lets move to Remark as that is what the Netlify CMS
  //       uses, so we can make sure we're using the same parser
  const mdRender = require('markdown-it')({linkify: true})
  .use(require('markdown-it-attrs'), {
    allowedAttributes: ['id', 'class', 'width', 'height', 'sizes']
  });

  // const mdRender = new MarkdownIt();
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

  function nextSecondTuesday(month = new Date().getMonth(), day = new Date().getDate()){
    var temp = new Date();
    temp.setMonth(month, day);
    var n = 1;
    while(temp.getDay()!= 2) temp.setDate(++n);
    temp.setDate(n+7);
    if(day>temp.getDate()){
      var nextMonth=temp.getMonth()+1;
      // everything is zero-indexed EXCEPT date; that starts with 1
      // as the first of the month.  If you set this to 0, it goes to
      // the last day of the previous month
      return nextSecondTuesday(nextMonth, 1);
    }
    return temp.toLocaleDateString();
  };
  eleventyConfig.addShortcode("nextBoardMeetingDate", function () {
    // return nextSecondTuesday();
    return "1/11/22"
  });




  // Minify HTML Output
  eleventyConfig.addTransform("htmlmin", function(content, outputPath) {
    // Eleventy 1.0+: use this.inputPath and this.outputPath instead
    if( isProduction && outputPath && outputPath.endsWith(".html") ) {
      let minified = htmlmin.minify(content, {
        useShortDoctype: true,
        removeComments: true,
        collapseWhitespace: true
      });
      return minified;
    }
    return content;
  });

  return {
    dir: {
      input: "src",
      output: "public",
    },
  };
};
