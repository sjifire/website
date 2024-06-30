const htmlmin = require("html-minifier");
const { DateTime } = require("luxon");
const CleanCSS = require("clean-css");
const util = require("util");
const yaml = require("js-yaml");
const _ = require("lodash");
const { parseHTML } = require("linkedom");
const { minify } = require("terser");
const nunjucks = require("nunjucks");
const fs = require("fs");
const pluginRss = require("@11ty/eleventy-plugin-rss");

const isProduction = process.env.ELEVENTY_ENV === `production`;

module.exports = function (eleventyConfig) {
  require("dotenv").config();
  siteData = require("./src/_data/site.json");

  const netlifyConfigs = nunjucks.render("netlify.toml.njk", {
    site: siteData,
  });
  fs.writeFileSync("netlify.toml", netlifyConfigs);

  eleventyConfig.addDataExtension("yml", (contents) => yaml.load(contents));
  // eleventyConfig.setDataDeepMerge(true);
  eleventyConfig.addPassthroughCopy("src/assets/");
  eleventyConfig.addPassthroughCopy("src/admin/");

  eleventyConfig.addPlugin(pluginRss, {
    posthtmlRenderOptions: {
      closingSingleTag: "default", // opt-out of <img/>-style XHTML single tags
    },
  });

  eleventyConfig.addFilter("limit", function (arr, limit) {
    return arr.slice(0, limit);
  });

  eleventyConfig.addFilter("cssmin", function (code) {
    return new CleanCSS({}).minify(code).styles;
  });

  eleventyConfig.addFilter("pluckByValue", function (arr, value, attr) {
    return arr.filter((item) => item[attr] === value);
  });

  eleventyConfig.addFilter("exclude", function (arr, selections, attr) {
    return arr.filter((item) => !selections.includes(item[attr]));
  });

  const now = new Date();
  const nowPlus24 = now.setHours(now.getHours() - 29);
  const hidePastItems = (event) => {
    if (nowPlus24 < new Date(event.date).getTime()) return false; //.setHours(datetime.getHours()+1)
    return true;
  };
  const hideFutureItems = (event) => {
    if (nowPlus24 > new Date(event.date).getTime()) return false;
    return true;
  };
  eleventyConfig.addCollection("pastMeetings", (collection) => {
    const allMeetings = collection.getAll()[0].data.meetings;
    return allMeetings.filter(hidePastItems).reverse();
  });

  eleventyConfig.addCollection("futureMeetings", (collection) => {
    const allMeetings = collection.getAll()[0].data.meetings;
    return allMeetings.filter(hideFutureItems);
  });

  // const MarkdownIt = require("markdown-it");
  //FIXME: Remark is not easily supported in 11ty at the moment
  //       once it is, lets move to Remark as that is what the Netlify CMS
  //       uses, so we can make sure we're using the same parser
  const mdRender = require("markdown-it")({
    linkify: true,
    typographer: true,
    html: true,
  })
    .use(require("markdown-it-attrs"), {
      allowedAttributes: ["id", "class", "width", "height", "sizes", "target"],
    })
    .use(require("markdown-it-video"));

  // const mdRender = new MarkdownIt();
  eleventyConfig.addFilter("markdownify", function (rawString) {
    return mdRender.render(rawString);
  });

  //TODO: cleanup, and perhaps handle both string and obj in one method; future work

  eleventyConfig.addFilter("postDateTerseNoYearISO", (dateObj) => {
    //NOTE: sometimes a string comes in, sometimes a date... so lets cleanup!
    if (typeof dateObj.toISOString === "function")
      dateObj = dateObj.toISOString();
    return DateTime.fromISO(dateObj, { zone: "utc" }).toLocaleString({
      month: "short",
      day: "numeric",
    });
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

  eleventyConfig.addFilter("htmlDateStringISO", (dateObj) => {
    //NOTE: sometimes a string comes in, sometimes a date... so lets cleanup!
    if (typeof dateObj.toISOString === "function")
      dateObj = dateObj.toISOString();
    return DateTime.fromISO(dateObj, { zone: "utc" }).toFormat("yyyy-LL-dd");
  });

  eleventyConfig.addFilter("postDateTerseJS", (dateObj) => {
    return DateTime.fromJSDate(dateObj, { zone: "utc" }).toLocaleString(
      DateTime.DATE_MED
    );
  });

  eleventyConfig.addFilter("yearOnlyJS", (dateObj) => {
    return DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat("yyyy");
  });

  eleventyConfig.addFilter("postDateToRfc3339", (dateObj) => {
    //NOTE: sometimes a string comes in, sometimes a date... so lets cleanup!
    if (typeof dateObj.toISOString === "function")
      dateObj = dateObj.toISOString();
    return DateTime.fromISO(dateObj, { zone: "utc" }).toISO();
  });

  eleventyConfig.addFilter("round", (num, place) => {
    if (!place) place = 0;
    return _.round(num, place);
  });

  eleventyConfig.addFilter("formatNumber", (num) => {
    return num.toLocaleString();
  });

  eleventyConfig.addFilter("dump", (obj) => {
    return util.inspect(obj);
  });

  const nextBoardMeetingDate = require("./src/modules/next_board_meeting_date");
  eleventyConfig.addShortcode("nextBoardMeetingDate", function () {
    return nextBoardMeetingDate().toLocaleDateString();
  });

  // SEE: https://github.com/sjifire/website/issues/127
  // for side-effects of using netlify rewrites.
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
    return `${siteData.cloudinaryRootUrl}/image/fetch/${cloudinaryCmds}/${siteData.rootUrl}/${assetPath}`;
  };

  eleventyConfig.addShortcode("imgPath", function (assetPath, cloudinaryCmds) {
    return imgPath(assetPath, cloudinaryCmds);
  });

  // from "@sardine/eleventy-plugin-external-links
  // but adding it for local pdfs
  eleventyConfig.addTransform("external-links", (content, outputPath) => {
    try {
      if (!outputPath || !outputPath.endsWith(".html")) return content;
      const { document } = parseHTML(content);
      const links = [...document.querySelectorAll("a")];
      if (links.length == 0) return content;
      links.map((link) => {
        //NOTE: a negative look-behind regex doesn't seem to work, ie
        // /\.(?!html)$/i.test(link.href)
        // so doing a double check, that there is a file extension AND it is not .html
        if (
          /^(https?\:\/\/|\/\/)/i.test(link.href) ||
          (/\.\w+$/i.test(link.href) && !/\.html$/i.test(link.href))
        ) {
          link.setAttribute("target", "_blank");
          link.setAttribute("rel", "noreferrer");
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
  eleventyConfig.addTransform("lazy-load-imgs", (content, outputPath) => {
    try {
      if (!outputPath || !outputPath.endsWith(".html")) return content;
      const { document } = parseHTML(content);
      const imgs = [...document.querySelectorAll("img")];
      if (imgs.length == 0) return content;
      imgs.map((img) => {
        //do not modify if loading attr is already set.
        if (!/logo/i.test(img.src) && img.loading !== undefined) {
          img.setAttribute("loading", "lazy");
        }
        return img;
      });
      content = document.toString();
    } catch (error) {
      console.error(error);
    }
    return content;
  });
  // const frameEditorComponent = require("./admin/editor-component-frame.js");
  // eleventyConfig.addTransform('convert HUGO shortcodes', (content, outputPath) => {
  //   try {
  //     if (!outputPath || !outputPath.endsWith('.html')) return content;
  //     while(match = content.match(window.NetlifyCmsEditorComponentFrame.pattern)){
  //       var block = window.NetlifyCmsEditorComponentFrame.fromBlock(match);
  //       var replacedHTML = window.NetlifyCmsEditorComponentFrame.toPreview(block);
  //       content = content.replace(match[0], replacedHTML);//only match the specific version!
  //     }
  //   } catch (error) {
  //     console.error(error);
  //   }
  //   return content;
  // });

  //FIXME: this is kind of bad form as it hides what is going on;
  //should probably move this to a helper that wraps internal images during build time
  //and not as a site-wide transform.
  eleventyConfig.addTransform(
    "wrap internal images",
    (content, outputPath, obj) => {
      try {
        if (!outputPath || !outputPath.endsWith(".html")) return content;
        // if (!isProduction) return content;
        const { document } = parseHTML(content);
        const imgs = [
          ...document.querySelectorAll(".l-grid img, .l-squeezed img"),
        ];
        if (imgs.length == 0) return content;
        imgs.map((img) => {
          if(img.className.includes('leave-alone')) return img
          if (!/^\//i.test(img.src)) return img
          //modify if local img
          if (/small_img/i.test(img.className)) imgSize = "w_400,h_200";
          else if (/med_img/i.test(img.className)) imgSize = "w_800,h_400";
          else imgSize = "w_1200,h_800";
          cloudinaryCmds = `f_auto,q_auto:good,c_limit,${imgSize}`;
          newImgURL = imgPath(img.src, cloudinaryCmds);
          // newImgURL = imgPath(img.src.replace('/assets', ''), cloudinaryCmds);
          // newImgURL = `${siteData.cloudinaryRootUrl}/image/fetch/f_auto,q_auto:good,c_limit,${imgSize}/${siteData.rootUrl}`
          parentDiv = img.parentNode;
          const figure = document.createElement("figure");
          figure.innerHTML = `
<img src="${newImgURL}" alt="${img.alt}" title="${img.title}" loading="lazy" />
<figcaption>
  ${img.title}
</figcaption>
`;
          if (parentDiv.localName === "p") {
            // markdown adds a <p> for every 2 \n that exist;
            // this is just a bit of extra cleanup to remove orphaned
            // <p> which may impact markdown.
            // we also move the figure up and out of the <p> tag so
            // you don't have to have two sets of styles, with one for
            // the figure inside a p tag, and one outside.
            origParentDiv = parentDiv;
            parentDiv = parentDiv.parentNode;

            parentDiv.insertBefore(figure, origParentDiv);
            origParentDiv.removeChild(img);
            if (
              parentDiv.childNodes.length <= 1 ||
              origParentDiv.innerHTML.trim() === ""
            ) {
              parentDiv.removeChild(origParentDiv);
            }
          } else {
            parentDiv.insertBefore(figure, img);
            parentDiv.removeChild(img);
          }
          return figure;
        });
        content = document.toString();
      } catch (error) {
        console.error(error);
      }
      return content;
    }
  );

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

  return {
    dir: {
      input: "src",
      output: "public",
    },
  };
};
