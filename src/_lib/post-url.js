/**
 * The URL a news post is published at.
 *
 * Rules, in order:
 *   1. A file named in PINNED_URLS gets that URL, verbatim.
 *   2. Otherwise /news/yyyy-LL-dd-<slug>, from the post's date and title.
 *   3. A date that cannot be parsed, or a title that slugs to nothing, fails
 *      the build naming the file — never a page named after the error.
 */
const slugify = require("slugify");
const { toDateTime } = require("./date-utils");

/**
 * Six posts published while the date was mis-parsed (see toDateTime) and
 * linked from outside at these addresses, so they keep them. Keyed by file
 * name rather than carried in front matter: a duplicated or re-saved post
 * cannot inherit a file name, so it cannot inherit a pin. Values are exactly
 * what is deployed — a leading slash, no trailing one, and the literal space.
 */
const PINNED_URLS = Object.freeze({
  "2026-03-09-20-year-strategic-plan.mdx":
    "/news/Invalid DateTime-20-year-strategic-plan",
  "2026-03-09-san-juan-county-fire-protection-district-no-3-receives-positive-audit-results-from-washington-state-auditor-s-office.mdx":
    "/news/Invalid DateTime-san-juan-county-fire-protection-district-no-3-receives-positive-audit-results-from-washington-state-auditors-office",
  "2026-04-13-2026-fire-fighter-awards-ceremony.mdx":
    "/news/Invalid DateTime-2026-fire-fighter-awards-ceremony",
  "2026-04-21-commissioners-visit-stuart-west-station-3741.mdx":
    "/news/Invalid DateTime-commissioners-visit-stuart-west-station-3741",
  "2026-05-19-district-3-swears-in-6-new-firefighters.mdx":
    "/news/Invalid DateTime-district-3-swears-in-6-new-firefighters",
  "2026-07-26-resolution-26-07-burn-permit-regulations.mdx":
    "/news/Invalid DateTime-resolution-26-07-burn-permit-regulations",
});

// The shape every consumer assumes: under /news/, no trailing slash (templates
// append their own). Checked so a pin pasted from a browser, which ends in
// one, fails loudly. The literal space in the legacy URLs is allowed on
// purpose — it is what is deployed and linked.
const PIN_SHAPE = /^\/news\/.*[^/]$/;

// These options define every published post URL; changing them moves pages.
// They are not the same as Tina's file-name rule or the Eleventy `slugify`
// filter — the audit post's file says "auditor-s-office", its URL
// "auditors-office" — and cannot be brought into line without renaming
// published posts, which is why that is left alone.
const SLUG_OPTIONS = Object.freeze({ lower: true, replacement: "-", strict: true });

/**
 * @param {{ date?: Date|string, title?: string }} post - front matter as parsed
 * @param {string} fileName - the post's file name, for pins and error messages
 * @returns {string} site-relative URL with no trailing slash
 */
function derivePostUrl(post, fileName) {
  if (typeof fileName !== "string" || fileName === "") {
    throw new TypeError("derivePostUrl needs the post's file name");
  }

  // Checked whether or not the URL is pinned. A pin fixes the address, not the
  // timestamp — feed <published>, JSON-LD datePublished and the <time> element
  // all still render this date, and an unreadable one reaches them as the
  // literal "Invalid DateTime" rather than stopping the build.
  const dt = toDateTime(post.date);
  if (!dt.isValid) {
    throw new Error(
      `${fileName}: cannot read date ${JSON.stringify(post.date)} (${dt.invalidReason}).`
    );
  }

  const pinned = PINNED_URLS[fileName];
  if (pinned !== undefined) {
    if (!PIN_SHAPE.test(pinned)) {
      throw new Error(`${fileName}: pinned URL ${JSON.stringify(pinned)} is not /news/<path> without a trailing slash`);
    }
    return pinned;
  }

  const slug = slugify(post.title ?? "", SLUG_OPTIONS);
  if (slug === "") {
    throw new Error(
      `${fileName}: cannot build a URL from title ${JSON.stringify(post.title)} — it has no letters or digits.`
    );
  }

  return `/news/${dt.toFormat("yyyy-LL-dd")}-${slug}`;
}

module.exports = { PINNED_URLS, PIN_SHAPE, derivePostUrl };
