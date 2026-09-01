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
 *
 * Surviving Liquid is only half the job: markdown-it then rejects the JSX
 * attribute as invalid HTML and prints it as text. normalizeJsxStyleAttributes
 * rewrites it to the plain HTML equivalent so the highlight actually renders.
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

// `style={{ ... }}` — the JSX form. Excluding braces from the body is what
// bounds the match, so a malformed `style={{` can't swallow the rest of the
// page looking for a far-off `}}`.
const JSX_STYLE_ATTRIBUTE = /\bstyle=\{\{([^{}]*)\}\}/g;

// One `key: "value"` pair, anchored so the parser can walk the object literal
// left to right and bail the moment it meets something it doesn't recognise.
const DECLARATION =
  /^\s*(?:([A-Za-z_$][A-Za-z0-9_$]*)|'([^']*)'|"([^"]*)")\s*:\s*(?:'([^']*)'|"([^"]*)")\s*(,|$)/;

// What a pasted CSS value is allowed to contain: colours (#FEF08A, red),
// functional notation (rgba(255, 255, 0, .5)), and lengths (1.5em). An
// allow-list rather than a ban-list, so the things that make a value dangerous
// are excluded by construction — `"` would end the attribute, `;` would append
// declarations nobody typed, and `:` would admit url(javascript:…) and
// url(https://…), the latter beaconing a host the CSP never allowed.
const SAFE_CSS_VALUE = /^[\w#%.,()/ -]+$/;

// backgroundColor -> background-color, WebkitBoxShadow -> -webkit-box-shadow.
function kebabCase(property) {
  return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Rewrite JSX style attributes into plain HTML ones.
 *
 * TinaCMS's rich-text editor serialises a highlight as MDX/JSX —
 * `<mark style={{ backgroundColor: "#FEF08A" }}>` — but this site compiles
 * .mdx as Liquid + markdown-it, not MDX. markdown-it only passes a tag through
 * when its attributes are valid HTML, so it escapes the opening `<mark …>` to
 * text while the closing `</mark>` sails through as markup: the editor sees
 * their JSX printed on the page, wrapped around a stray unmatched close tag.
 *
 * Normalising here rather than in the file itself is deliberate. Writing plain
 * HTML into join.mdx was tried in #203 and Tina rewrote it back to JSX on the
 * very next save (d2f5065) — the CMS owns that string, so the build has to be
 * what tolerates it.
 *
 * Only fully-quoted values are converted. Unquoted ones (`fontSize: 12`, where
 * React would infer "px", or a bare identifier) are left exactly as they are:
 * rendering them as visible text is wrong in an obvious way, whereas guessing
 * at units is wrong in a way nobody would catch.
 *
 * @param {string} content - page body as authored
 * @returns {string} body with convertible JSX style attributes rewritten
 */
function normalizeJsxStyleAttributes(content) {
  if (typeof content !== "string") return content;

  return content.replace(JSX_STYLE_ATTRIBUTE, (original, objectLiteral) => {
    const declarations = [];
    let rest = objectLiteral;

    while (rest.trim() !== "") {
      const match = DECLARATION.exec(rest);
      if (!match) return original;

      const [consumed, identifier, singleQuotedKey, doubleQuotedKey, singleQuotedValue, doubleQuotedValue] = match;
      // Quoting a key is a formatting choice, not a semantic one, so the same
      // kebab-casing applies however it was written.
      const key = kebabCase(identifier ?? singleQuotedKey ?? doubleQuotedKey);
      const value = (singleQuotedValue ?? doubleQuotedValue).trim();

      if (!/^-{0,2}[a-z][a-z0-9-]*$/.test(key)) return original;
      if (!SAFE_CSS_VALUE.test(value)) return original;

      declarations.push(`${key}: ${value}`);
      rest = rest.slice(consumed.length);
    }

    if (declarations.length === 0) return original;
    return `style="${declarations.join("; ")}"`;
  });
}

function protectCmsContent(inputPath, content) {
  // Normalized first, and for every page. The allow-listed pages are editable
  // in Tina too (the `page` collection is all of src/pages bar the homepage),
  // and they get no {% raw %} to fall back on — a highlight pasted into one of
  // them would reach Liquid as `{{ backgroundColor: ... }}` and take the build
  // down. Rewriting the attribute removes the braces; their own Liquid, which
  // never looks like `style={{`, is untouched.
  const normalized = normalizeJsxStyleAttributes(content);

  if (usesLiquid(inputPath)) {
    return normalized;
  }
  return `{% raw %}${normalized}{% endraw %}`;
}

module.exports = {
  LIQUID_ENABLED_PAGES,
  usesLiquid,
  protectCmsContent,
  normalizeJsxStyleAttributes,
};
