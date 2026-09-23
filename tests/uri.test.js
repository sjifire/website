const { describe, it } = require("node:test");
const assert = require("node:assert");
const { uriPath } = require("../src/_lib/uri");
const { PINNED_URLS } = require("../src/_lib/post-url");

describe("uriPath", () => {
  it("encodes the space in the six published URLs that carry one", () => {
    for (const url of Object.values(PINNED_URLS)) {
      const encoded = uriPath(`https://www.sjifire.org${url}/`);
      assert.doesNotMatch(encoded, / /, url);
      assert.strictEqual(encoded, new URL(encoded).href, "a URL parser leaves it alone");
      assert.strictEqual(decodeURI(encoded), `https://www.sjifire.org${url}/`, "same address");
    }
  });

  // It is applied to every <loc> and canonical tag, so it has to be invisible
  // on the pages that were already fine.
  it("leaves an already-legal URL byte for byte", () => {
    for (const url of [
      "https://www.sjifire.org/",
      "https://www.sjifire.org/about/board-of-commissioners/",
      "https://www.sjifire.org/news/2022-01-18-we-are-an-ems-agency/",
    ]) {
      assert.strictEqual(uriPath(url), url);
    }
  });

  // Liquid's own url_encode is form encoding: it would write "+" for the space
  // and escape every slash, which is a different address.
  it("keeps the path separators a form encoder would escape", () => {
    assert.strictEqual(uriPath("/news/Invalid DateTime-x/"), "/news/Invalid%20DateTime-x/");
  });

  // encodeURI escapes "%", so a second pass would turn %20 into %2520.
  it("is not safe to apply twice, which is why nothing here does", () => {
    assert.strictEqual(uriPath(uriPath("/a b")), "/a%2520b");
  });

  it("renders nothing for a missing value rather than the word undefined", () => {
    assert.strictEqual(uriPath(undefined), "");
    assert.strictEqual(uriPath(null), "");
  });
});
