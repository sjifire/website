const CleanCSS = require("clean-css");
const { DateTime } = require("luxon");
const { minify } = require("terser");
const pluginRss = require("@11ty/eleventy-plugin-rss");
const util = require("util");

const isProduction = process.env.ELEVENTY_ENV === `production`;

module.exports = function(eleventyConfig) {
  siteData = require("./src/_data/site.json");

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

  eleventyConfig.addPlugin(pluginRss, {
    posthtmlRenderOptions: {
      closingSingleTag: "default", // opt-out of <img/>-style XHTML single tags
    },
  });


  // // Add collections
  // eleventyConfig.addCollection("posts", function(collectionApi) {
  //   return collectionApi.getFilteredByGlob("src/posts/*.md").sort((a, b) => {
  //     return b.date - a.date;
  //   });
  // });

  // Date filter
  eleventyConfig.addFilter("dateDisplay", (dateObj) => {
    return new Date(dateObj).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  });
  eleventyConfig.addFilter("yearOnlyJS", (dateObj) => {
    return DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat("yyyy");
  });
  eleventyConfig.addFilter("postDateTerseNoYearISO", (dateObj) => {
    if(!dateObj) return; // sometimes we get an undefined through here
    //NOTE: sometimes a string comes in, sometimes a date... so lets cleanup!
    if (typeof dateObj.toISOString === "function")
      dateObj = dateObj.toISOString();
    return DateTime.fromISO(dateObj, { zone: "utc" }).toLocaleString({
      month: "short",
      day: "numeric",
    });
  });
  eleventyConfig.addFilter("htmlDateStringISO", (dateObj) => {
    //NOTE: sometimes a string comes in, sometimes a date... so lets cleanup!
    if (typeof dateObj.toISOString === "function")
      dateObj = dateObj.toISOString();
    return DateTime.fromISO(dateObj, { zone: "utc" }).toFormat("yyyy-LL-dd");
  });
  eleventyConfig.addFilter("postDateTerseISO", (dateObj) => {
    //NOTE: sometimes a string comes in, sometimes a date... so lets cleanup!
    if (typeof dateObj.toISOString === "function")
      dateObj = dateObj.toISOString();
    return DateTime.fromISO(dateObj, { zone: "utc" }).toLocaleString(
      DateTime.DATE_MED
    );
  });
  eleventyConfig.addFilter("postDateVerboseISO", (dateObj) => {
    //NOTE: sometimes a string comes in, sometimes a date... so lets cleanup!
    if (typeof dateObj.toISOString === "function")
      dateObj = dateObj.toISOString();
    return DateTime.fromISO(dateObj, { zone: "utc" }).toLocaleString(
      DateTime.DATE_HUGE
    );
  });
  eleventyConfig.addFilter("postDateToRfc3339", (dateObj) => {
    //NOTE: sometimes a string comes in, sometimes a date... so lets cleanup!
    if (typeof dateObj.toISOString === "function")
      dateObj = dateObj.toISOString();
    return DateTime.fromISO(dateObj, { zone: "utc" }).toISO();
  });


  eleventyConfig.addFilter("dump", (obj) => {
console.log(`here: ${obj}`)
    return util.inspect(obj);
  });


  eleventyConfig.addFilter("limit", function(array, limit) {
    if(!array) return;
    return array.slice(0, limit);
  });

  eleventyConfig.addFilter("pluckByValue", function (arr, value, attr) {
    if(!arr || !value) return; // sometimes we get an undefined through here
    return arr.filter((item) => item[attr] === value);
  });

  eleventyConfig.addFilter("formatNumber", (num) => {
    return num.toLocaleString();
  });


  eleventyConfig.addFilter("cssmin", function (code) {
    return new CleanCSS({}).minify(code).styles;
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

  // Minify HTML Output
  eleventyConfig.addTransform("htmlmin", function (content, outputPath) {
    // Eleventy 1.0+: use this.inputPath and this.outputPath instead
    if (isProduction && outputPath && outputPath.endsWith(".html")) {
      let minified = htmlmin.minify(content, {
        useShortDoctype: true,
        removeComments: true,
        collapseWhitespace: true,
      });
      return minified;
    }
    return content;
  });


  // REVIEW -- Can we remove these?
  const mdRender = require("markdown-it")({
    linkify: true,
    typographer: true,
    html: true,
  });
  eleventyConfig.addFilter("markdownify", function (rawString) {
    if(!rawString) return; // sometimes we get an undefined through here
    return mdRender.render(rawString);
  });

  // Process TinaCMS styled-image components
  eleventyConfig.addFilter("processStyledImages", function (content) {
    if (!content) return content;
    const regex = /<(?:styled-image|StyledImage)\s+([^>]*)(?:\/>|><\/(?:styled-image|StyledImage)>)/g;
    return content.replace(regex, (match, attrs) => {
      const src = attrs.match(/src=["']([^"']+)["']/)?.[1] || '';
      const alt = attrs.match(/alt=["']([^"']+)["']/)?.[1] || '';
      const size = attrs.match(/size=["']([^"']+)["']/)?.[1] || 'full';
      const align = attrs.match(/align=["']([^"']+)["']/)?.[1] || 'center';
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
    return url
  };
  eleventyConfig.addShortcode("imgPath", function (assetPath, cloudinaryCmds) {
    return imgPath(assetPath, cloudinaryCmds);
  });



//   // Remove .html from `page.url`
// eleventyConfig.addUrlTransform(({ url }) => {
//     var newUrl = url.replace('/pages', '');
//     console.log(`here: ${url} -- ${newUrl}`)
//     return newUrl;
//   });

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



  // return {
  //   dir: {
  //     input: "src",
  //     output: "public",
  //   },
  // };
