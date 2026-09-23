/**
 * Percent-encode a site URL for emission into a sitemap <loc>, an Atom
 * <link href> or a canonical tag.
 *
 * Six published post URLs carry a literal space (see post-url.js); a space is
 * not a legal URI character, so Google reports those sitemap entries as
 * invalid and skips the pages. %20 addresses the identical resource — it is
 * what a browser sends for that link either way — so this fixes how the URL is
 * written down without moving the page.
 *
 * Not Liquid's own `url_encode`, which is form encoding: that turns a space
 * into "+" and escapes the slashes. encodeURI leaves an already-legal URL byte
 * for byte, so it is a no-op on every other page. It does escape "%", so this
 * must not be applied twice; no URL here contains one.
 *
 * @param {string|*} url
 * @returns {string}
 */
function uriPath(url) {
  return url === null || url === undefined ? "" : encodeURI(String(url));
}

module.exports = { uriPath };
