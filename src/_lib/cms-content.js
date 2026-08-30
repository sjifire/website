/**
 * Guard TinaCMS-managed pages against the Liquid template engine.
 *
 * Eleventy runs every .mdx page through Liquid before markdown
 * (markdownTemplateEngine: "liquid"). That is what lets a handful of pages
 * print data such as {{ personnel.counts.volunteerFirefighters }}, but it also
 * means anything an editor types or pastes into TinaCMS is executed as
 * template code. In August 2026 a pasted highlight arrived as MDX/JSX,
 * `<mark style={{ backgroundColor: "#FEF08A" }}>`, and Liquid failed on the
 * `{{ ... }}` with `expected "|" before filter`, taking the whole build down.
 *
 * Only the pages listed below deliberately use Liquid in their body. Every
 * other page is wrapped in {% raw %} ... {% endraw %} so stray braces render
 * literally instead of breaking the site.
 */
const path = require("node:path");

const LIQUID_ENABLED_PAGES = new Set([
  "src/pages/about/key-information.mdx",
  "src/pages/about/governance.mdx",
]);

function normalizeInputPath(inputPath) {
  return path
    .normalize(inputPath)
    .split(path.sep)
    .join("/")
    .replace(/^\.\//, "");
}

function usesLiquid(inputPath) {
  return LIQUID_ENABLED_PAGES.has(normalizeInputPath(inputPath));
}

function protectCmsContent(inputPath, content) {
  if (usesLiquid(inputPath)) {
    return content;
  }
  return `{% raw %}${content}{% endraw %}`;
}

module.exports = { LIQUID_ENABLED_PAGES, usesLiquid, protectCmsContent };
