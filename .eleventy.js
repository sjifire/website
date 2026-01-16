const yaml = require("js-yaml");
const { Liquid } = require("liquidjs");
const createCloudinary = require("./src/_lib/cloudinary");
const { dateFilters, getNextMeeting, formatMeetingSchedule } = require("./src/_lib/date-utils");

const isProduction = process.env.ELEVENTY_ENV === "production";

module.exports = function(eleventyConfig) {
  const siteData = require("./src/_data/site.json");
  const cloudinary = createCloudinary(siteData, isProduction);

  // Create custom Liquid engine with additional options
  const liquidEngine = new Liquid({
    extname: ".liquid",
    root: ["src/_includes/", "src/"],
    dynamicPartials: true,
    strictFilters: false,
    jsTruthy: true, // Use JavaScript truthiness (empty arrays/objects are truthy but we handle this)
  });

  // Set Eleventy to use our custom Liquid engine
  eleventyConfig.setLibrary("liquid", liquidEngine);

  // Add YAML support for data files
  eleventyConfig.addDataExtension("yml,yaml", (contents) => yaml.load(contents));

  // Copy static assets
  eleventyConfig.addPassthroughCopy("src/assets/");
  eleventyConfig.addPassthroughCopy("src/js/");

  // Copy Azure Static Web Apps config to output root
  eleventyConfig.addPassthroughCopy({ "staticwebapp.config.json": "staticwebapp.config.json" });

  // Process CSS files as templates
  eleventyConfig.addTemplateFormats("css");
  eleventyConfig.addExtension("css", {
    outputFileExtension: "css",
    compile: async function(inputContent) {
      return async () => inputContent;
    }
  });

  // Process MDX files as markdown (for TinaCMS compatibility)
  eleventyConfig.addExtension("mdx", {
    key: "md",  // Treat MDX as markdown
  });

  // Collection for content includes (MDX files that feed into Liquid templates)
  eleventyConfig.addCollection("contentIncludes", function(collectionApi) {
    return collectionApi.getFilteredByTag("content-include");
  });

  // ===============================
  // Date filters (from date-utils.js)
  // ===============================
  Object.entries(dateFilters).forEach(([name, filter]) => {
    eleventyConfig.addFilter(name, filter);
  });

  // ===============================
  // Custom filters
  // ===============================

  // Limit array to N items
  eleventyConfig.addFilter("limit", function(array, limit) {
    if(!array) return;
    if(!limit) return array;
    return array.slice(0, parseInt(limit, 10));
  });

  // Filter array by object property value
  eleventyConfig.addFilter("pluckByValue", function (arr, value, attr) {
    if(!arr || !value) return;
    return arr.filter((item) => item[attr] === value);
  });

  // Format numbers with locale
  eleventyConfig.addFilter("formatNumber", (num) => {
    return num.toLocaleString();
  });

  // Next meeting date filter for governance page
  eleventyConfig.addFilter("nextMeetingDate", function(schedule, override) {
    return getNextMeeting(schedule, override, siteData.timezone);
  });

  // Format meeting schedule as readable string (e.g., "third Tuesday of every month at 3:00 PM")
  eleventyConfig.addFilter("formatMeetingSchedule", function(schedule) {
    return formatMeetingSchedule(schedule);
  });

  // Markdown rendering filter
  const mdRender = require("markdown-it")({
    linkify: true,
    typographer: true,
    html: true,
  }).use(require("markdown-it-attrs"));

  eleventyConfig.addFilter("markdownify", function (rawString) {
    if(!rawString) return;
    return mdRender.render(rawString);
  });

  // Process TinaCMS styled-image components
  eleventyConfig.addFilter("processStyledImages", function (content) {
    if (!content) return content;
    const regex = /<(?:styled-image|StyledImage)\s+([^>]*)(?:\/>|><\/(?:styled-image|StyledImage)>)/g;
    return content.replace(regex, (match, attrs) => {
      const src = attrs.match(/src=["']([^"']+)["']/)?.[1] || "";
      const alt = attrs.match(/alt=["']([^"']+)["']/)?.[1] || "";
      const size = attrs.match(/size=["']([^"']+)["']/)?.[1] || "full";
      const align = attrs.match(/align=["']([^"']+)["']/)?.[1] || "center";
      const classes = `styled-image styled-image--${size} styled-image--${align}`;
      const optimizedSrc = cloudinary.imgPath(src, "f_auto,q_auto:good");
      return `<figure class="${classes}"><img src="${optimizedSrc}" alt="${alt}" /><figcaption>${alt}</figcaption></figure>`;
    });
  });

  // Cloudinary image path shortcode and filters
  eleventyConfig.addShortcode("imgPath", cloudinary.imgPath);
  eleventyConfig.addFilter("imgPath", cloudinary.imgPath);
  eleventyConfig.addFilter("headerImageUrls", cloudinary.headerImageUrls);

  // ===============================
  // Additional Liquid filters
  // ===============================

  // Group array by attribute
  eleventyConfig.addFilter("groupby", function(arr, attr) {
    if (!arr || !Array.isArray(arr)) return {};
    const groups = {};
    arr.forEach(item => {
      const key = item[attr];
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  });

  // Convert object to sorted array of [key, value] pairs
  eleventyConfig.addFilter("dictsort", function(obj) {
    if (!obj || typeof obj !== "object") return [];
    return Object.entries(obj).sort((a, b) => {
      if (a[0] < b[0]) return -1;
      if (a[0] > b[0]) return 1;
      return 0;
    });
  });

  // Round with optional precision and method (extending Liquid's built-in round)
  eleventyConfig.addFilter("round", function(num, precision = 0, method) {
    if (num === null || num === undefined) return num;
    const factor = Math.pow(10, precision);
    if (method === "ceil") {
      return Math.ceil(num * factor) / factor;
    } else if (method === "floor") {
      return Math.floor(num * factor) / factor;
    }
    return Math.round(num * factor) / factor;
  });

  // Slugify string (URL-safe lowercase)
  eleventyConfig.addFilter("slugify", function(str) {
    if (!str) return "";
    return str.toString().toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]+/g, "")
      .replace(/--+/g, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, "");
  });

  // Default value filter (treats null, undefined, empty string, and false as missing)
  eleventyConfig.addFilter("default", function(val, defaultVal) {
    if (val === null || val === undefined || val === "" || val === false) {
      return defaultVal;
    }
    return val;
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    },
    templateFormats: ["md", "mdx", "liquid", "html"],
    markdownTemplateEngine: "liquid",
    htmlTemplateEngine: "liquid"
  };
};
