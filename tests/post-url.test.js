const { describe, it } = require("node:test");
const assert = require("node:assert");
const matter = require("gray-matter");
const { PINNED_URLS, derivePostUrl } = require("../src/_lib/post-url");

// What gray-matter hands back for the two spellings of a date in src/posts:
// Tina's datetime field writes it unquoted (parsed as a timestamp, surfaced as
// a JS Date); the older hand-written posts quote it (stays a string).
const parsed = (yaml) => matter(`---\n${yaml}\n---\n`).data;

describe("derivePostUrl", () => {
  it("builds the same URL from either spelling of the date", () => {
    const fromTina = derivePostUrl(
      { ...parsed("date: 2026-03-09T19:59:15.933Z"), title: "Boat Rescue" },
      "2026-03-09-boat-rescue.mdx"
    );
    const fromHand = derivePostUrl(
      { ...parsed('date: "2026-03-09"'), title: "Boat Rescue" },
      "2026-03-09-boat-rescue.mdx"
    );
    assert.strictEqual(fromTina, "/news/2026-03-09-boat-rescue");
    assert.strictEqual(fromHand, fromTina);
  });

  // "Don't create more of them": an unbuildable post stops the build with the
  // file named, rather than publishing at /news/Invalid DateTime-<slug>/ or
  // /news/<date>-/.
  it("refuses a date it cannot parse, naming the file", () => {
    assert.throws(
      () => derivePostUrl({ date: "not a date", title: "Oops" }, "2026-01-01-oops.mdx"),
      /2026-01-01-oops\.mdx: cannot build a URL from date "not a date"/
    );
    assert.throws(
      () => derivePostUrl({ title: "No date" }, "2026-01-01-no-date.mdx"),
      /cannot build a URL from date/
    );
  });

  // Tina's required check is `!value`, so these titles get through it.
  it("refuses a title that slugs to nothing, naming the file", () => {
    for (const title of ["   ", "🔥", "???", ""]) {
      assert.throws(
        () => derivePostUrl({ date: "2026-09-01", title }, "2026-09-01-x.mdx"),
        /2026-09-01-x\.mdx: cannot build a URL from title/,
        JSON.stringify(title)
      );
    }
  });

  it("needs the file name, since that is what pins and errors are keyed on", () => {
    assert.throws(() => derivePostUrl({ date: "2026-09-01", title: "T" }), TypeError);
    assert.throws(() => derivePostUrl({ date: "2026-09-01", title: "T" }, ""), TypeError);
  });

  // "Stay compatible with what is published": the pin wins outright, whatever
  // the date and title would derive.
  it("returns the pinned URL for a pinned file, ignoring date and title", () => {
    const [fileName, url] = Object.entries(PINNED_URLS)[0];
    assert.strictEqual(
      derivePostUrl({ date: "1999-01-01", title: "Completely Different" }, fileName),
      url
    );
  });
});

describe("PINNED_URLS", () => {
  // Exactly the six that were published before the parsing was fixed; a
  // seventh would mean a new one was created, which is the thing being
  // prevented.
  it("names exactly six files", () => {
    assert.strictEqual(Object.keys(PINNED_URLS).length, 6);
  });

  it("every pin is the shape consumers assume: under /news/, no trailing slash", () => {
    for (const [fileName, url] of Object.entries(PINNED_URLS)) {
      assert.match(url, /^\/news\/.*[^/]$/, fileName);
      assert.match(url, /^\/news\/Invalid DateTime-/, `${fileName} is not a legacy URL`);
    }
  });

  it("cannot be changed at runtime", () => {
    assert.ok(Object.isFrozen(PINNED_URLS));
  });
});
