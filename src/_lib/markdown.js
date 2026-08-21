/**
 * Markdown rendering for the markdownify filter
 * Centralizes markdown-it configuration so it can be tested independently
 */

const MarkdownIt = require("markdown-it");
const markdownItAttrs = require("markdown-it-attrs");

// breaks: true so newlines in TinaCMS-authored content become <br>
// html: true is required for existing content; XSS risk mitigated by admin-only content editing
const MARKDOWN_OPTIONS = {
  linkify: true,
  typographer: true,
  html: true,
  breaks: true,
};

/**
 * Creates the site's markdown renderer
 * @returns {Object} configured markdown-it instance
 */
function createMarkdownRenderer() {
  const md = new MarkdownIt(MARKDOWN_OPTIONS).use(markdownItAttrs);

  // markdown-it 15 ships linkify-it 6, which changed the fuzzyLink default to
  // false. Authors write bare URLs like "www.islandsready.org" in TinaCMS, and
  // those were linked under markdown-it 14 — leaving the default would silently
  // turn already-published links into plain text.
  md.linkify.set({ fuzzyLink: true });

  return md;
}

const renderer = createMarkdownRenderer();

/**
 * Renders a markdown string to HTML
 * @param {string} rawString - markdown source
 * @returns {string|undefined} rendered HTML, or undefined for empty input
 */
function markdownify(rawString) {
  if (!rawString) return;
  return renderer.render(rawString);
}

module.exports = { createMarkdownRenderer, markdownify };
