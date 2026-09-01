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

// Content of a raw HTML block that is not text the page shows. Comments exist
// to be invisible, so publishing an editor's "draft > final" note as the
// description would be worse than the empty description this replaced; script
// and style bodies are markup a Word or Docs paste routinely brings along.
const HTML_HIDDEN = /<!--[\s\S]*?-->|<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

// Tags that end a run of text. Closing inline tags deliberately are not here:
// "sjifire<b>.org</b>" is one word, and giving every tag a space split it.
const HTML_BOUNDARY =
  /<\s*(?:br\b[^>]*|\/\s*(?:p|div|li|tr|td|th|h[1-6]|blockquote|section|article|header|footer|figure|figcaption|ul|ol|dl|dd|dt|table|pre)\b\s*)>/gi;

const HTML_TAG = /<[^>]*>/g;

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
      for (const child of token.children) {
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
          case "html_inline":
            if (INLINE_BREAK.test(child.content)) words.push(" ");
            break;
          default:
            break;
        }
      }
    } else if (token.type === "fence" || token.type === "code_block") {
      words.push(token.content);
    } else if (token.type === "html_block") {
      // A lede pasted as raw HTML is one whole block whose content never
      // reaches children, so it would otherwise come back empty and fall
      // through to the headline. Hidden constructs are removed before the tags
      // are, since those are the ones where leaking text is actively wrong
      // rather than untidy. What remains is a regex, not a parser: a ">" inside
      // an attribute value still ends a tag early and leaves a fragment of it
      // in the text. That is the residual cost of not having an HTML parser
      // here, and it is cosmetic — nothing downstream parses this again.
      words.push(
        renderer.utils.unescapeAll(
          token.content
            .replace(HTML_HIDDEN, " ")
            .replace(HTML_BOUNDARY, " ")
            .replace(HTML_TAG, "")
        )
      );
    } else {
      continue;
    }
    // Blocks run together without this: "First para.Second para."
    words.push(" ");
  }

  return words.join("").replace(ZERO_WIDTH, "").replace(/\s+/g, " ").trim();
}

module.exports = { createMarkdownRenderer, markdownify, markdownToPlainText };
