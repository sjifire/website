const yaml = require("js-yaml");
const { Liquid } = require("liquidjs");
const escapeHtml = require("escape-html");
const { sanitizeUrl } = require("@braintree/sanitize-url");
const createCloudinary = require("./src/_lib/cloudinary");
const { dateFilters, getNextMeeting, formatMeetingSchedule } = require("./src/_lib/date-utils");
const { markdownify } = require("./src/_lib/markdown");
const { uriPath } = require("./src/_lib/uri");
const { templateEngineFor, normalizeJsxStyleAttributes } = require("./src/_lib/cms-content");

module.exports = function(eleventyConfig) {
  const siteData = require("./src/_data/site.json");

  // Allow environment variable to override Cloudinary fetch URL (for PR staging environments)
  const cloudinaryConfig = {
    ...siteData,
    cloudinaryFetchUrl: process.env.CLOUDINARY_FETCH_URL || siteData.cloudinaryFetchUrl
  };
  const cloudinary = createCloudinary(cloudinaryConfig);

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

  // TinaCMS-managed pages are content, not templates, so they compile as
  // markdown only — "{{" or "{%" typed or pasted by an editor is then text,
  // with no template engine that could execute or choke on it. Pages that
  // deliberately use Liquid are allow-listed in src/_lib/cms-content.js.
  // Also rewrites the JSX style attributes Tina writes for a highlight.
  eleventyConfig.addPreprocessor("protect-cms-content", "mdx", (data, content) => {
    const engine = templateEngineFor(data.page.inputPath);
    // Either branch overrules front matter, so the allow-list stays the only
    // switch. Deleting, not assigning undefined, is what restores Eleventy's
    // default — it treats the key's presence as an override on its own.
    if (engine) {
      data.templateEngineOverride = engine;
    } else {
      delete data.templateEngineOverride;
    }
    return normalizeJsxStyleAttributes(content);
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

  // Filter array where property equals value (like Jekyll/Jinja where filter)
  eleventyConfig.addFilter("where", function(arr, attr, value) {
    if (!arr) return [];
    return arr.filter((item) => item[attr] === value);
  });

  // Filter array excluding items where property equals value
  eleventyConfig.addFilter("reject", function(arr, attr, value) {
    if (!arr) return [];
    return arr.filter((item) => item[attr] !== value);
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

  // Markdown rendering filter (see src/_lib/markdown.js for the configuration)
  eleventyConfig.addFilter("markdownify", markdownify);

  // Process TinaCMS styled-image components
  // Security: Validates size/align values and escapes alt text to prevent XSS
  eleventyConfig.addFilter("processStyledImages", function (content) {
    if (!content) return content;
    const ALLOWED_SIZES = ["small", "medium", "full"];
    const ALLOWED_ALIGNS = ["left", "center", "right"];

    const regex = /<(?:styled-image|StyledImage)\s+([^>]*)(?:\/>|><\/(?:styled-image|StyledImage)>)/g;
    return content.replace(regex, (match, attrs) => {
      const src = attrs.match(/src=["']([^"']+)["']/)?.[1] || "";
      const alt = attrs.match(/alt=["']([^"']+)["']/)?.[1] || "";
      let size = attrs.match(/size=["']([^"']+)["']/)?.[1] || "full";
      let align = attrs.match(/align=["']([^"']+)["']/)?.[1] || "center";

      // Validate size and align against whitelist
      size = ALLOWED_SIZES.includes(size) ? size : "full";
      align = ALLOWED_ALIGNS.includes(align) ? align : "center";

      // Escape alt text to prevent XSS
      const safeAlt = escapeHtml(alt);

      const classes = `styled-image styled-image--${size} styled-image--${align}`;
      const optimizedSrc = cloudinary.imgPath(src, "f_auto,q_auto:good");
      return `<figure class="${classes}"><img src="${optimizedSrc}" alt="${safeAlt}" /><figcaption>${safeAlt}</figcaption></figure>`;
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

  // Percent-encodes a URL on its way into a sitemap <loc>, an Atom <link href>
  // or a canonical tag; see src/_lib/uri.js for why.
  eleventyConfig.addFilter("uriPath", uriPath);

  // Safe URL filter - sanitizes URLs to prevent XSS (uses @braintree/sanitize-url)
  eleventyConfig.addFilter("safeUrl", function(url) {
    if (!url || typeof url !== "string") return "#";
    const sanitized = sanitizeUrl(url);
    // sanitizeUrl returns "about:blank" for dangerous URLs
    return sanitized === "about:blank" ? "#" : sanitized;
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
