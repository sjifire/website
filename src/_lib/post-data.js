/**
 * Turning one post's front matter into the object every template sees.
 *
 * Split out of src/_data/posts.js so the rules below can be exercised on
 * inputs the repository cannot hold: a post whose front matter would fail the
 * build is, by definition, not a post that can be committed as a fixture.
 */
const { toDateTime, requireDateTime, DateTime } = require("./date-utils");
const { derivePostUrl } = require("./post-url");

/**
 * @param {Object} data - front matter as gray-matter parsed it
 * @param {string} content - the post body
 * @param {string} fileName - for the URL pins and for error messages
 * @param {DateTime} [now] - the instant archived_at is measured against
 * @returns {Object} the post, with date and archived_at as ISO strings
 */
function normalizePost(data, content, fileName, now = DateTime.now()) {
  // Tina writes dates unquoted, so gray-matter yields a Date; the older posts
  // quote theirs, so they stay strings. Normalized to ISO once, here, so no
  // consumer ever sees the mixed type — LiquidJS's `sort: "date"` in
  // feed.liquid was comparing the two kinds and scrambling the feed order.
  // An unparseable value is left as-is for derivePostUrl to report.
  const date = toDateTime(data.date);
  const post = { ...data, date: date.isValid ? date.toISO() : data.date };

  // Only when the post has one, so posts without an archive date keep no key
  // at all rather than gaining an explicit undefined.
  //
  // Checked as strictly as the date, and read once. It used to fall through to
  // the raw string, which a second parser downstream then read by different
  // rules — Luxon rejects "2026-04-30 12:00", `new Date` accepts it — so the
  // post archived while the sitemap advertised <lastmod>Invalid DateTime</lastmod>
  // for it, and nothing failed.
  let archived = false;
  if (data.archived_at) {
    const archivedAt = requireDateTime(data.archived_at, "archived_at", fileName);
    post.archived_at = archivedAt.toISO();
    archived = archivedAt <= now;
  }

  return { ...post, archived, body: content, url: derivePostUrl(post, fileName) };
}

module.exports = { normalizePost };
