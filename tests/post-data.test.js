const { describe, it } = require("node:test");
const assert = require("node:assert");

const { normalizePost } = require("../src/_lib/post-data");
const { DateTime } = require("../src/_lib/date-utils");

// A post that is valid in every respect the test under it is not about.
const base = { title: "A Post", date: "2026-02-01T00:00:00Z" };
const at = (iso) => DateTime.fromISO(iso, { zone: "utc" });

describe("normalizePost", () => {
  it("hands on the date as an ISO string, whichever way it was written", () => {
    // Tina's unquoted timestamp reaches gray-matter as a Date; the older posts
    // quote theirs. Both come out the same here so nothing downstream sorts a
    // Date against a string.
    const fromDate = normalizePost({ ...base, date: new Date("2026-02-01T00:00:00Z") }, "", "a.mdx");
    const fromString = normalizePost(base, "", "a.mdx");
    assert.strictEqual(fromDate.date, fromString.date);
    assert.strictEqual(typeof fromDate.date, "string");
  });

  it("fails naming the file when the date cannot be read", () => {
    assert.throws(
      () => normalizePost({ ...base, date: "2026-13-45" }, "", "a.mdx"),
      /a\.mdx: cannot read date "2026-13-45"/
    );
  });

  describe("archived_at", () => {
    it("is absent, and archived false, when the post has no archive date", () => {
      const post = normalizePost(base, "", "a.mdx");
      assert.strictEqual("archived_at" in post, false);
      assert.strictEqual(post.archived, false);
    });

    it("normalizes to an ISO string like the date does", () => {
      const post = normalizePost(
        { ...base, archived_at: new Date("2026-04-30T12:00:00Z") },
        "", "a.mdx", at("2026-01-01T00:00:00Z")
      );
      assert.strictEqual(post.archived_at, "2026-04-30T12:00:00.000Z");
    });

    it("archives the post once the date has passed", () => {
      const archived_at = "2026-04-30T12:00:00Z";
      assert.strictEqual(
        normalizePost({ ...base, archived_at }, "", "a.mdx", at("2026-05-01T00:00:00Z")).archived,
        true
      );
      assert.strictEqual(
        normalizePost({ ...base, archived_at }, "", "a.mdx", at("2026-04-01T00:00:00Z")).archived,
        false
      );
    });

    // The whole reason this is validated: archived_at used to fall through as
    // a raw string when Luxon could not read it, and `new Date` downstream
    // then read it by different rules. The post archived on one parser's
    // reading while the sitemap advertised <lastmod>Invalid DateTime</lastmod>
    // for it — a URL Search Console rejects — and nothing failed the build.
    it("fails naming the file on a spelling only the other parser accepted", () => {
      for (const archived_at of ["2026-04-30 12:00", "April 30, 2026"]) {
        assert.ok(!isNaN(new Date(archived_at)), `precondition: new Date reads ${archived_at}`);
        assert.throws(
          () => normalizePost({ ...base, archived_at }, "", "a.mdx"),
          /a\.mdx: cannot read archived_at/,
          archived_at
        );
      }
    });

    it("leaves an empty archive date alone rather than failing on it", () => {
      for (const archived_at of ["", null, undefined]) {
        const post = normalizePost({ ...base, archived_at }, "", "a.mdx");
        assert.strictEqual(post.archived, false, String(archived_at));
      }
    });
  });
});
