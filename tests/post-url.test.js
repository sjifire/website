const { describe, it } = require("node:test");
const assert = require("node:assert");
const matter = require("gray-matter");
const { toDateTime, derivePostUrl } = require("../src/_lib/post-url");

// What gray-matter hands back for the two spellings of a date that exist in
// src/posts: Tina's datetime field writes the value unquoted, which YAML
// parses as a timestamp and gray-matter surfaces as a JS Date; the older
// hand-written posts quote it, which stays a string.
const parsed = (yaml) => matter(`---\n${yaml}\n---\n`).data;

describe("toDateTime", () => {
  it("reads the unquoted timestamp Tina writes, which arrives as a Date", () => {
    const { date } = parsed("date: 2026-03-09T19:59:15.933Z");
    assert.ok(date instanceof Date, "precondition: gray-matter gives a Date");
    assert.strictEqual(toDateTime(date).toFormat("yyyy-LL-dd"), "2026-03-09");
  });

  it("reads the quoted string the older posts carry", () => {
    const { date } = parsed('date: "2021-11-10"');
    assert.strictEqual(typeof date, "string", "precondition: gray-matter gives a string");
    assert.strictEqual(toDateTime(date).toFormat("yyyy-LL-dd"), "2021-11-10");
  });

  it("is invalid, not a throw, for anything else", () => {
    for (const value of [undefined, null, 42, {}]) {
      assert.strictEqual(toDateTime(value).isValid, false, String(value));
    }
  });
});

describe("derivePostUrl", () => {
  it("builds the same URL from either spelling of the date", () => {
    const fromTina = derivePostUrl({ ...parsed("date: 2026-03-09T19:59:15.933Z"), title: "Boat Rescue" });
    const fromHand = derivePostUrl({ ...parsed('date: "2026-03-09"'), title: "Boat Rescue" });
    assert.strictEqual(fromTina, "/news/2026-03-09-boat-rescue");
    assert.strictEqual(fromHand, fromTina);
  });

  it("never names a page after the error", () => {
    const url = derivePostUrl({ ...parsed("date: 2026-05-19T18:52:15.889Z"), title: "Swears In" });
    assert.doesNotMatch(url, /Invalid/);
  });

  // "Don't create more of them": an unbuildable date stops the build with the
  // file named, rather than publishing at /news/Invalid DateTime-<slug>/.
  it("refuses to build a URL from a date it cannot parse, naming the file", () => {
    assert.throws(
      () => derivePostUrl({ date: "not a date", title: "Oops" }, "2026-01-01-oops.mdx"),
      /2026-01-01-oops\.mdx: cannot build a URL from date "not a date"/
    );
    assert.throws(() => derivePostUrl({ title: "No date at all" }), /cannot build a URL/);
  });

  // "Stay compatible with what is published": a pinned URL wins outright, even
  // one that the derivation would never produce.
  it("uses a pinned permalink instead of deriving", () => {
    const post = {
      ...parsed("date: 2026-03-09T19:59:15.933Z"),
      title: "20-Year Strategic Plan",
      permalink: "/news/Invalid DateTime-20-year-strategic-plan",
    };
    assert.strictEqual(derivePostUrl(post), "/news/Invalid DateTime-20-year-strategic-plan");
  });
});

// The six that were published before the parsing was fixed. These are the
// URLs that are linked from outside; if one changes, a published link breaks.
const PUBLISHED_AT_BROKEN_URL = [
  "/news/Invalid DateTime-20-year-strategic-plan",
  "/news/Invalid DateTime-2026-fire-fighter-awards-ceremony",
  "/news/Invalid DateTime-commissioners-visit-stuart-west-station-3741",
  "/news/Invalid DateTime-district-3-swears-in-6-new-firefighters",
  "/news/Invalid DateTime-resolution-26-07-burn-permit-regulations",
  "/news/Invalid DateTime-san-juan-county-fire-protection-district-no-3-receives-positive-audit-results-from-washington-state-auditors-office",
];

describe("the real posts", () => {
  const posts = require("../src/_data/posts");
  const urls = posts.map((p) => p.url);

  it("still publish the six at exactly the URL they were published at", () => {
    for (const pinned of PUBLISHED_AT_BROKEN_URL) {
      assert.ok(urls.includes(pinned), `missing: ${pinned}`);
    }
  });

  it("publish every other post at a date-and-slug URL, with no new broken ones", () => {
    const derived = urls.filter((u) => !PUBLISHED_AT_BROKEN_URL.includes(u));
    assert.strictEqual(derived.length, urls.length - PUBLISHED_AT_BROKEN_URL.length);
    for (const url of derived) {
      assert.match(url, /^\/news\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/, url);
    }
  });

  it("have no duplicate URLs", () => {
    assert.strictEqual(new Set(urls).size, urls.length);
  });
});
