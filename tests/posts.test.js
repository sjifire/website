const { describe, it } = require("node:test");
const assert = require("node:assert");

describe("post archive logic", () => {
  // Replicate the archive logic from src/_data/posts.js
  const isArchived = (post) => {
    const now = new Date();
    return !!(post.archived_at && new Date(post.archived_at) <= now);
  };

  it("marks post as archived when archived_at is in the past", () => {
    const post = { archived_at: "2020-01-01T00:00:00.000Z" };
    assert.strictEqual(isArchived(post), true);
  });

  it("does not archive post when archived_at is in the future", () => {
    const post = { archived_at: "2099-01-01T00:00:00.000Z" };
    assert.strictEqual(isArchived(post), false);
  });

  it("does not archive post without archived_at", () => {
    const post = {};
    assert.strictEqual(isArchived(post), false);
  });

  it("does not archive post with null archived_at", () => {
    const post = { archived_at: null };
    assert.strictEqual(isArchived(post), false);
  });

  it("does not archive post with empty string archived_at", () => {
    const post = { archived_at: "" };
    assert.strictEqual(isArchived(post), false);
  });
});

describe("posts data loader", () => {
  const { PINNED_URLS } = require("../src/_lib/post-url");
  const posts = require("../src/_data/posts");
  const urls = posts.map((p) => p.url);
  const pinned = new Set(Object.values(PINNED_URLS));

  it("loads posts and sets archived flag", () => {
    assert.ok(Array.isArray(posts), "posts should be an array");
    assert.ok(posts.length > 0, "should have at least one post");

    for (const post of posts) {
      assert.strictEqual(typeof post.archived, "boolean", `post "${post.title}" should have boolean archived flag`);
    }
  });

  // The six that were published at /news/Invalid DateTime-<slug>/ before the
  // date parsing was fixed are linked from outside; if one moves, a link breaks.
  it("still publishes every pinned post at exactly its pinned URL", () => {
    for (const url of pinned) {
      assert.ok(urls.includes(url), `missing: ${url}`);
    }
  });

  // `assert.ok(post.url)` used to stand here, and it passed while six pages
  // lived at a URL made of an error message.
  it("publishes every other post at a date-and-slug URL", () => {
    const derived = urls.filter((u) => !pinned.has(u));
    assert.strictEqual(derived.length, urls.length - pinned.size);
    for (const url of derived) {
      assert.match(url, /^\/news\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/, url);
    }
  });

  it("gives no two posts the same URL", () => {
    assert.strictEqual(new Set(urls).size, urls.length);
  });

  // Normalized at load so feed.liquid's `sort: "date"` compares like with like;
  // with a mix of Date and string it was scrambling the feed order.
  it("hands every consumer the date as an ISO string, never a Date", () => {
    for (const post of posts) {
      assert.strictEqual(typeof post.date, "string", post.title);
      if (post.archived_at) assert.strictEqual(typeof post.archived_at, "string", post.title);
    }
  });

  // The feed used Liquid's `date` filter, which formats in the build machine's
  // local time, and stamped a hardcoded "Z" after it — so every <published>
  // was off by the machine's UTC offset, and date-only posts by a calendar
  // day. Asserted over the built feed because no unit test sees the template.
  describe("the built Atom feed", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const { dateFilters } = require("../src/_lib/date-utils");
    const feedPath = path.resolve(__dirname, "../_site/news/feed.xml");
    const feed = fs.existsSync(feedPath) ? fs.readFileSync(feedPath, "utf8") : "";

    // Skipped rather than failed when _site is absent; CI builds before test:unit.
    it("stamps each entry with the post's true UTC instant", { skip: feed === "" }, () => {
      // Per <entry>, so the feed's own top-level <id> is not paired with the
      // first entry's <published>.
      const entries = [...feed.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, body]) => ({
        id: body.match(/<id>([^<]+)<\/id>/)?.[1],
        published: body.match(/<published>([^<]+)<\/published>/)?.[1],
      }));
      assert.ok(entries.length > 0, "feed has entries");

      for (const { id, published } of entries) {
        assert.ok(id, "every entry has an <id>");
        const post = posts.find((p) => id.endsWith(`${p.url}/`));
        assert.ok(post, `no post for feed id ${id}`);
        assert.strictEqual(published, dateFilters.isoDateTimeUTC(post.date), post.title);
      }
    });
  });

  // The check above cannot see the bug it documents: CI runs in UTC, where
  // Liquid's local-time `date` filter and a real UTC filter agree byte for
  // byte, so reverting the templates would keep it green. This one holds
  // wherever it runs.
  describe("the templates that emit timestamps", () => {
    const fs = require("node:fs");
    const path = require("node:path");

    for (const template of ["feed.liquid", "sitemap.liquid", "_includes/base.liquid"]) {
      it(`${template} formats dates in UTC, not the build machine's zone`, () => {
        const source = fs.readFileSync(path.resolve(__dirname, "../src", template), "utf8");
        assert.doesNotMatch(
          source,
          /\|\s*date\s*:/,
          `${template} uses Liquid's \`date\` filter, which formats in local time; ` +
            "use isoDateTimeUTC or htmlDateStringISO"
        );
      });
    }
  });

  it("splits into active and archived posts correctly", () => {
    const posts = require("../src/_data/posts");
    const activePosts = require("../src/_data/activePosts");
    const archivedPosts = require("../src/_data/archivedPosts");

    assert.strictEqual(
      activePosts.length + archivedPosts.length,
      posts.length,
      "active + archived should equal total posts"
    );

    for (const post of activePosts) {
      assert.strictEqual(post.archived, false, `active post "${post.title}" should not be archived`);
    }

    for (const post of archivedPosts) {
      assert.strictEqual(post.archived, true, `archived post "${post.title}" should be archived`);
    }
  });

  it("archived posts have archived_at dates in the past", () => {
    const archivedPosts = require("../src/_data/archivedPosts");
    const now = new Date();

    for (const post of archivedPosts) {
      assert.ok(post.archived_at, `archived post "${post.title}" should have archived_at`);
      assert.ok(new Date(post.archived_at) <= now, `archived post "${post.title}" archived_at should be in the past`);
    }
  });
});
