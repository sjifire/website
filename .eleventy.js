const htmlmin      = require("html-minifier");
const { DateTime } = require("luxon");
const CleanCSS     = require("clean-css");
const util         = require("util");
const slugify      = require("slugify");
const yaml         = require("js-yaml");
const _            = require("lodash");
const { parseHTML } = require("linkedom");

const isProduction = process.env.ELEVENTY_ENV === `production`;

module.exports = function (eleventyConfig) {
  require("dotenv").config();

  eleventyConfig.addDataExtension("yml", contents => yaml.load(contents));
  // eleventyConfig.setDataDeepMerge(true);
  eleventyConfig.addPassthroughCopy("src/assets/");

  eleventyConfig.addFilter("limit", function (arr, limit) {
    return arr.slice(0, limit);
  });

  eleventyConfig.addFilter("cssmin", function (code) {
    return new CleanCSS({}).minify(code).styles;
  });

  
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
    allowedAttributes: ['id', 'class', 'width', 'height', 'sizes', 'target']
  })
  .use(require('markdown-it-video'));

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

  //TODO: cleanup, and perhaps handle both string and obj in one method; future work

  eleventyConfig.addFilter("postDateTerseNoYearISO", (dateObj) => {
    return DateTime.fromISO(dateObj, {zone: 'utc'}).toLocaleString({ month: 'short', day: 'numeric' });
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
  
  eleventyConfig.addFilter("postDateTerseJS", (dateObj) => {
    return DateTime.fromJSDate(dateObj, {zone: 'utc'}).toLocaleString(DateTime.DATE_MED);
  });

  eleventyConfig.addFilter("yearOnlyJS", (dateObj) => {
    return DateTime.fromJSDate(dateObj, {zone: 'utc'}).toFormat('yyyy');
  });

  eleventyConfig.addFilter("round", (num, place) => {
    if(!place) place = 0;
    return _.round(num, place);
  });

  eleventyConfig.addFilter("formatNumber", (num) => {
    return num.toLocaleString();
  });
  
  eleventyConfig.addFilter("dump", (obj) => {
    return util.inspect(obj);
  });

  const nextBoardMeetingDate = require('./src/modules/next_board_meeting_date')
  eleventyConfig.addShortcode("nextBoardMeetingDate", function () {
    return nextBoardMeetingDate().toLocaleDateString();
  });

  // from "@sardine/eleventy-plugin-external-links
  // but adding it for local pdfs
  eleventyConfig.addTransform('external-links', (content, outputPath) => {
    try {
      if (!outputPath || !outputPath.endsWith('.html')) return content
      const { document } = parseHTML(content);
      const links = [...document.querySelectorAll('a')];
      if (links.length == 0) return content
      links.map((link) => {
        if (/^(https?\:\/\/|\/\/)/i.test(link.href) ||
            /\.pdf$/i.test(link.href)) {
          link.setAttribute('target', '_blank');
          link.setAttribute('rel', 'noreferrer');
        }
        return link;
      });
      content = document.toString();
    } catch (error) {
      console.error(error);
    }
    return content;
  });

  //lazy load EXCEPT logo; can we do this via tag attr or class rather
  // than hardcode?
  eleventyConfig.addTransform('lazy-load-imgs', (content, outputPath) => {
    try {
      if (!outputPath || !outputPath.endsWith('.html')) return content;
      const { document } = parseHTML(content);
      const imgs = [...document.querySelectorAll('img')];
      if (imgs.length == 0) return content;
      imgs.map((img) => {
        //do not modify if loading attr is already set.
        if (!/logo/i.test(img.src) && img.loading !== undefined){
          img.setAttribute('loading', 'lazy');
        }
        return img;
      });
      content = document.toString();
    } catch (error) {
      console.error(error);
    }
    return content;
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
