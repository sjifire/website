/**
 * Keep TinaCMS-managed pages away from the Liquid template engine.
 *
 * Eleventy runs every .mdx page through Liquid before markdown
 * (markdownTemplateEngine: "liquid"). That is what lets a handful of pages
 * print data such as {{ personnel.counts.volunteerFirefighters }}, but it also
 * means anything an editor types or pastes into TinaCMS is executed as
 * template code. In August 2026 a pasted highlight arrived as MDX/JSX,
 * `<mark style={{ backgroundColor: "#FEF08A" }}>`, and Liquid failed on the
 * `{{ ... }}` with `expected "|" before filter`, taking the whole build down.
 *
 * #204 wrapped those pages in {% raw %} ... {% endraw %}. That was escapable:
 * an editor whose text contained `{% endraw %}` closed the block early and
 * handed the remainder back to Liquid, which is the outage it existed to
 * prevent. There is no delimiter an editor cannot type, so the page instead
 * declares it isn't a Liquid template at all — see templateEngineFor. Only the
 * pages listed below deliberately use Liquid in their body, and they remain
 * exposed to that outage; see the note on LIQUID_ENABLED_PAGES.
 *
 * Not running Liquid is only half the job: markdown-it then rejects the JSX
 * attribute as invalid HTML and prints it as text. normalizeJsxStyleAttributes
 * rewrites it to the plain HTML equivalent so the highlight actually renders.
 */
const path = require("node:path");

// The two pages that print data in their body, and so must stay on Liquid.
//
// Note what this costs them: both are inside Tina's `page` collection
// (tina/config.ts — `path: "src/pages"`, only `homepage` excluded), so an
// editor can reach them, and for these two a typed "{{" or an unmatched "{%"
// still fails the build exactly as in the August outage. The guarantee above
// covers every .mdx page under src/pages except the two named here. Closing
// that would mean excluding them from the Tina collection — an editorial
// decision, not one to make here.
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
// functional notation (rgba(255, 255, 0, .5)), and lengths (1.5em). Excluding
// `"` keeps a value from ending the attribute, `;` from appending declarations
// nobody typed, and `:` from admitting url(javascript:…) or url(https://…).
const SAFE_CSS_VALUE = /^[\w#%.,() -]+$/;

// Excluding `:` is not enough on its own: a protocol-relative url(//host/x.png)
// needs no scheme, and a relative url(x.png) needs no slash. Nothing a
// rich-text editor produces fetches a resource, so refuse the one CSS function
// that can — otherwise a pasted highlight could load, and thereby report a
// visit to, a host the CSP never allowed.
const CSS_URL_FUNCTION = /\burl\s*\(/i;

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
      if (CSS_URL_FUNCTION.test(value)) return original;

      declarations.push(`${key}: ${value}`);
      rest = rest.slice(consumed.length);
    }

    if (declarations.length === 0) return original;
    return `style="${declarations.join("; ")}"`;
  });
}

/**
 * Which template engine a page should be compiled with.
 *
 * CMS pages get "md" — markdown only, no Liquid, so "{{" or "{%" an editor
 * typed is text rather than something to execute or choke on. Allow-listed
 * pages get undefined, meaning "leave Eleventy's default alone", which is the
 * markdownTemplateEngine ("liquid") their `{{ personnel.counts.* }}` needs.
 *
 * The caller applies this over any templateEngineOverride already in a page's
 * front matter, which is deliberate: a page opting itself back into Liquid
 * there would be a second switch, invisible to this list, re-exposing a
 * Tina-editable page to the outage. Put it in LIQUID_ENABLED_PAGES instead,
 * where the cost is stated and reviewable.
 *
 * @param {string} inputPath - Eleventy inputPath for the page
 * @returns {string|undefined} engine override, or undefined to keep the default
 */
function templateEngineFor(inputPath) {
  return usesLiquid(inputPath) ? undefined : "md";
}

module.exports = {
  LIQUID_ENABLED_PAGES,
  usesLiquid,
  templateEngineFor,
  normalizeJsxStyleAttributes,
};
