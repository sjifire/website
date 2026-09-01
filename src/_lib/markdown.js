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

// <br> in any spelling: a word boundary that arrives as raw inline HTML.
// [^>]* rather than \s*\/? because a paste from Word or Docs carries
// attributes, and <br class="x"> is still a line break.
const INLINE_BREAK = /^\s*<br\b[^>]*>\s*$/i;

// Elements whose contents the page never shows. markdown-it hands these back
// as html_inline tags with the body as an ordinary text child between them, so
// without tracking the open tag the body reads as article prose.
const HIDDEN_OPEN = /^<\s*(?:script|style|template|noscript)\b/i;
const HIDDEN_CLOSE = /^<\s*\/\s*(?:script|style|template|noscript)\s*>/i;

// Only the two that are stray, not the joiners. JavaScript's \s matches
// U+FEFF, so a zero-width space in a lede became a visible one ("S<ZWSP>tuart"
// -> "S tuart"); U+200C/U+200D carry meaning — stripping ZWJ turned the
// firefighter emoji into two unrelated glyphs.
const ZERO_WIDTH = /[\u200B\uFEFF]/g;

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
    if (token.type === "inline") {
      // Reset per block, so an unclosed hidden tag costs one paragraph rather
      // than the rest of the description.
      let hidden = 0;

      for (const child of token.children) {
        if (child.type === "html_inline") {
          if (HIDDEN_OPEN.test(child.content)) hidden += 1;
          else if (HIDDEN_CLOSE.test(child.content)) hidden = Math.max(0, hidden - 1);
          else if (hidden === 0 && INLINE_BREAK.test(child.content)) words.push(" ");
          continue;
        }

        if (hidden > 0) continue;

        switch (child.type) {
          case "text":
          case "code_inline":
            words.push(child.content);
            break;
          // Every kind of line break is a word boundary. Dropping them silently
          // welded words together: a lede reading "Wildland Team\nFire
          // Simulation" came out as "TeamFire Simulation".
          case "softbreak":
          case "hardbreak":
            words.push(" ");
            break;
          default:
            break;
        }
      }
    } else if (token.type === "fence" || token.type === "code_block") {
      words.push(token.content);
    } else {
      // Everything else, html_block included, contributes nothing.
      //
      // Extracting text from a pasted HTML block was tried and withdrawn. Three
      // review rounds found three separate ways for a regex strip to publish
      // what the page hides — an editor's <!-- draft note -->, the <style> a
      // Docs paste carries, an unterminated one of either — and one where a
      // bare "<" in the prose deleted the words after it. Doing it correctly
      // needs an HTML parser, which is not worth a dependency for a
      // description field, and no post is written this way.
      //
      // The cost is that such a lede yields nothing and the caller falls back
      // to the headline. That is the wrong description, visibly; the
      // alternative was the right one with hidden text mixed in.
      continue;
    }
    // Blocks run together without this: "First para.Second para."
    words.push(" ");
  }

  return words.join("").replace(ZERO_WIDTH, "").replace(/\s+/g, " ").trim();
}

module.exports = { createMarkdownRenderer, markdownify, markdownToPlainText };
