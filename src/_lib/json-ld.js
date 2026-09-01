/**
 * Emit a value as a JSON string literal for a JSON-LD <script> body.
 *
 * The blocks in base.liquid used `| escape` inside
 * <script type="application/ld+json">. That is the wrong escape twice over.
 *
 * A script body is raw text — the HTML parser does not decode entities in it —
 * so `Meet & Greet` was reaching consumers as the literal `Meet &amp; Greet`.
 * And `escape` leaves the characters JSON actually cares about alone: a title
 * containing a quote, a backslash or a newline produced invalid JSON, and a
 * parser that rejects the block drops the whole thing silently.
 *
 * Every "<" is escaped so an editor cannot close the script element from
 * inside a string. Without that, a title containing "</script>" ends the block
 * early and whatever follows is parsed as markup — the one case here that is a
 * vulnerability rather than a correctness bug. The escape is ordinary JSON and
 * reads back as "<".
 *
 * Returns the surrounding quotes as well, so templates interpolate it bare:
 *   "headline": {{ post.title | jsonLd }}
 *
 * @param {*} value - value to emit; nullish becomes an empty string
 * @returns {string} a JSON string literal, quotes included
 */
function jsonLd(value) {
  return JSON.stringify(value ?? "").replace(/</g, "\\u003c");
}

module.exports = { jsonLd };
