/**
 * The URL a news post is published at.
 *
 * Derived from the date and title unless the post pins one with `permalink`.
 *
 * Tina's datetime field writes its value unquoted — `date: 2026-03-09T19:59:15.933Z`
 * — so gray-matter hands back a JS Date rather than the string the older,
 * hand-quoted posts carry. DateTime.fromISO() given a Date is silently invalid,
 * and toFormat() on an invalid DateTime returns the literal string
 * "Invalid DateTime", which is how six posts came to be published at
 * /news/Invalid DateTime-<slug>/. Those six keep that URL, pinned, because
 * it is what is linked; nothing new gets one, because an unbuildable date now
 * fails the build instead of naming the page after the error.
 */
const slugify = require("slugify");
const { DateTime } = require("luxon");

/**
 * @param {Date|string|undefined} value - front-matter date as gray-matter parsed it
 * @returns {DateTime} UTC DateTime; check .isValid
 */
function toDateTime(value) {
  if (value instanceof Date) return DateTime.fromJSDate(value, { zone: "utc" });
  if (typeof value === "string") return DateTime.fromISO(value, { zone: "utc" });
  return DateTime.invalid("not a Date or an ISO string");
}

/**
 * @param {{ date?: Date|string, title?: string, permalink?: string }} post
 * @param {string} [source] - file name, for the error message
 * @returns {string} site-relative URL with no trailing slash
 */
function derivePostUrl(post, source = "post") {
  if (post.permalink) return post.permalink;

  const dt = toDateTime(post.date);
  if (!dt.isValid) {
    throw new Error(
      `${source}: cannot build a URL from date ${JSON.stringify(post.date)} (${dt.invalidReason}). ` +
        "Fix the date, or pin the URL with a permalink field."
    );
  }

  //FIXME: standardize slugify... can we set global configs?
  const slug = slugify(post.title ?? "", { lower: true, replacement: "-", strict: true });
  return `/news/${dt.toFormat("yyyy-LL-dd")}-${slug}`;
}

module.exports = { toDateTime, derivePostUrl };
