/**
 * Markdown rendering for the markdownify filter
 * Centralizes markdown-it configuration so it can be tested independently
 */

const MarkdownIt = require("markdown-it");
const markdownItAttrs = require("markdown-it-attrs");
const { normalizeJsxStyleAttributes } = require("./cms-content");

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
  // The mdx preprocessor only ever sees a page body, but Tina's rich-text
  // fields also live in front matter (join.mdx's sidebar_blocks) and in JSON
  // collections (a post's lede and body). Those all arrive here instead, so
  // this is where the other two thirds of the CMS gets the same treatment.
  return renderer.render(normalizeJsxStyleAttributes(rawString));
}

/**
 * Renders a markdown string to plain text.
 *
 * For places that need the words without any HTML around them — a JSON-LD
 * script body, where entities are not decoded, so the `&amp;` that markdownify
 * correctly emits for an HTML attribute would reach a consumer literally.
 *
 * Reads the token stream rather than stripping tags off rendered HTML: token
 * content is already decoded (markdown-it escapes only at render time, and
 * typographer's curly quotes are real characters by then), so this needs no
 * entity table of its own to fall behind.
 *
 * @param {string} rawString - markdown source
 * @returns {string} the text content, whitespace collapsed
 */
function markdownToPlainText(rawString) {
  if (!rawString) return "";

  const words = [];
  for (const token of renderer.parse(normalizeJsxStyleAttributes(rawString), {})) {
    if (token.type !== "inline") continue;
    for (const child of token.children) {
      if (child.type === "text" || child.type === "code_inline") {
        words.push(child.content);
      }
    }
    // Blocks run together without this: "First para.Second para."
    words.push(" ");
  }

  return words.join("").replace(/\s+/g, " ").trim();
}

module.exports = { createMarkdownRenderer, markdownify, markdownToPlainText };
