const CleanCSS = require("clean-css");
const { DateTime } = require("luxon");
const { minify } = require("terser");

const isProduction = process.env.ELEVENTY_ENV === "production";

module.exports = function(eleventyConfig) {
  const siteData = require("./src/_data/site.json");

  // Copy static assets
  eleventyConfig.addPassthroughCopy("src/assets/");

  // Process CSS files as templates with minification in production
  eleventyConfig.addTemplateFormats("css");
  eleventyConfig.addExtension("css", {
    outputFileExtension: "css",
    compile: async function(inputContent) {
      return async () => {
        if (isProduction) {
          return new CleanCSS({}).minify(inputContent).styles;
        }
        return inputContent;
      };
    }
  });

  // Process MDX files as markdown (for TinaCMS compatibility)
  eleventyConfig.addExtension("mdx", {
    key: "md",  // Treat MDX as markdown
  });

  // Collection for content includes (MDX files that feed into NJK templates)
  eleventyConfig.addCollection("contentIncludes", function(collectionApi) {
    return collectionApi.getFilteredByTag("content-include");
  });

  // Date filters - factory to reduce duplication
  // Handles both Date objects and ISO strings, always uses UTC to avoid DST issues
  const createDateFilter = (formatter) => (dateObj) => {
    if (!dateObj) return;
    if (typeof dateObj.toISOString === "function") {
      dateObj = dateObj.toISOString();
    }
    const dt = DateTime.fromISO(dateObj, { zone: "utc" });
    return typeof formatter === "string" ? dt.toFormat(formatter) : dt.toLocaleString(formatter);
  };

  eleventyConfig.addFilter("postDateTerseNoYearISO", createDateFilter({ month: "short", day: "numeric" }));
  eleventyConfig.addFilter("htmlDateStringISO", createDateFilter("yyyy-LL-dd"));
  eleventyConfig.addFilter("postDateTerseISO", createDateFilter(DateTime.DATE_MED));
  eleventyConfig.addFilter("postDateVerboseISO", createDateFilter(DateTime.DATE_HUGE));
  eleventyConfig.addFilter("limit", function(array, limit) {
    if(!array) return;
    if(!limit) return array;
    return array.slice(0, parseInt(limit, 10));
  });

  eleventyConfig.addFilter("pluckByValue", function (arr, value, attr) {
    if(!arr || !value) return; // sometimes we get an undefined through here
    return arr.filter((item) => item[attr] === value);
  });

  eleventyConfig.addFilter("formatNumber", (num) => {
    return num.toLocaleString();
  });


  eleventyConfig.addNunjucksAsyncFilter(
    "jsmin",
    async function (code, callback) {
      try {
        if (!isProduction) return callback(null, code);
        const minified = await minify(code);
        callback(null, minified.code);
      } catch (err) {
        console.error("Terser error: ", err);
        // Fail gracefully.
        callback(null, code);
      }
    }
  );

  const mdRender = require("markdown-it")({
    linkify: true,
    typographer: true,
    html: true,
  }).use(require("markdown-it-attrs"));
  eleventyConfig.addFilter("markdownify", function (rawString) {
    if(!rawString) return; // sometimes we get an undefined through here
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
      return `<figure class="${classes}"><img src="${src}" alt="${alt}" /><figcaption>${alt}</figcaption></figure>`;
    });
  });


  const imgPath = (assetPath, cloudinaryCmds) => {
    // if(helpers.env !== 'production') return ''
    //HOWEVER, a double // seems to make it hard for Cloudinary to find the src img...
    // so stripping all leading /
    assetPath = assetPath.replace(/^\/+/, "");
    if (!cloudinaryCmds) cloudinaryCmds = "f_auto";
    if (isProduction && siteData.enable_cloudinary_rewrites) {
      if (/^(\/)?optim\//.test(assetPath)) {
        // already exists...
        // can be called twice if called directly in a template then again from a transform
        // so just use what the orig assetPath was.
        return `/${assetPath}`;
      }
      return `/optim/${assetPath}?c_param=${cloudinaryCmds}`;
    }
    var url = `${siteData.cloudinaryRootUrl}/image/fetch/${cloudinaryCmds}/${siteData.cloudinarySiteId}/${assetPath}`;
    // console.log(`imgPath-2: '${assetPath}' -- ${url}`);
    return url;
  };
  eleventyConfig.addShortcode("imgPath", function (assetPath, cloudinaryCmds) {
    return imgPath(assetPath, cloudinaryCmds);
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    },
    templateFormats: ["md", "mdx", "njk", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};
