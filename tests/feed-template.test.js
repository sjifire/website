const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const matter = require("gray-matter");
const { Liquid } = require("liquidjs");

const { dateFilters } = require("../src/_lib/date-utils");
const { markdownify } = require("../src/_lib/markdown");
const { uriPath } = require("../src/_lib/uri");

// src/feed.liquid rendered directly, so its behaviour can be checked on data
// the site does not currently have — chiefly the case where every post is
// archived. The built feed in posts.test.js covers the real content; this
// covers the branches that content never reaches.
const source = matter(
  fs.readFileSync(path.resolve(__dirname, "../src/feed.liquid"), "utf8")
).content;

const liquid = new Liquid({ strictFilters: true });
for (const [name, filter] of Object.entries(dateFilters)) liquid.registerFilter(name, filter);
liquid.registerFilter("markdownify", markdownify);
liquid.registerFilter("uriPath", uriPath);

const site = { prodUrl: "https://example.test", site_name: "Test", site_desc: "Desc" };
const post = (date, url) => ({ title: "T", date, url, body: "b", tags: [] });

const render = (activePosts, posts = activePosts) =>
  liquid.parseAndRender(source, { site, activePosts, posts });

const updatedIn = (xml) => xml.match(/<feed[\s\S]*?<updated>([^<]*)<\/updated>/)[1];
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

describe("feed.liquid", () => {
  it("dates the feed by its newest entry", async () => {
    const xml = await render([
      post("2026-01-01T00:00:00Z", "/news/a"),
      post("2026-03-01T09:30:00Z", "/news/b"),
      post("2026-02-01T00:00:00Z", "/news/c"),
    ]);
    assert.strictEqual(updatedIn(xml), "2026-03-01T09:30:00Z");
  });

  // atom:feed/updated is required and must be a date. Left to the newest
  // active post alone it rendered empty here, which makes the whole feed
  // unparseable rather than merely entry-less.
  it("still carries a date when every post is archived", async () => {
    const archived = [post("2026-01-01T00:00:00Z", "/news/a"), post("2026-02-01T00:00:00Z", "/news/b")];
    const xml = await render([], archived);
    assert.match(updatedIn(xml), RFC3339);
    assert.strictEqual(updatedIn(xml), "2026-02-01T00:00:00Z");
    assert.doesNotMatch(xml, /<entry>/, "no active post means no entries");
  });

  // A space is not legal in a URI, and six published post URLs contain one.
  it("percent-encodes an entry's href but not its id", async () => {
    const xml = await render([post("2026-01-01T00:00:00Z", "/news/Invalid DateTime-x")]);
    assert.match(xml, /<link href="https:\/\/example\.test\/news\/Invalid%20DateTime-x\/"/);
    assert.match(xml, /<id>https:\/\/example\.test\/news\/Invalid DateTime-x\/<\/id>/);
  });
});
