const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { Liquid } = require("liquidjs");
const { markdownify } = require("../src/_lib/markdown");

const BASE_LIQUID = fs.readFileSync(
  path.resolve(__dirname, "../src/_includes/base.liquid"),
  "utf8"
);

// Matches how .eleventy.js builds the engine, so a construct that behaves
// differently there can't pass here. `default` is the one filter whose
// behaviour jsTruthy could plausibly change, and it happens to special-case
// strings by length — don't rely on that coincidence, keep the options aligned.
const liquid = new Liquid({
  extname: ".liquid",
  root: ["src/_includes/", "src/"],
  dynamicPartials: true,
  strictFilters: false,
  jsTruthy: true,
});

describe("base.liquid", () => {
  // Anything emitted above <!DOCTYPE html> puts every page on the site into
  // quirks mode. Rendering the preamble rather than pattern-matching it catches
  // the whole class: a Jinja-style {# #} comment, which LiquidJS has no tag for
  // and so prints verbatim; a stray {{ output }} or {% include %}; and a
  // {% comment %} body LiquidJS chokes on.
  // Both branches: the homepage takes a different path through the preamble, so
  // testing only an interior URL leaves half of it unpinned.
  for (const url of ["/", "/news/example/"]) {
    it(`emits nothing before the doctype (${url})`, async () => {
      const preamble = BASE_LIQUID.slice(0, BASE_LIQUID.indexOf("<!DOCTYPE"));
      const rendered = await liquid.parseAndRender(preamble, {
        page: { url },
        title: "Example",
        description: "Example description",
        site: { site_name: "Site Name", site_desc: "Site description" },
      });

      assert.strictEqual(
        rendered.trim(),
        "",
        `base.liquid emits this before <!DOCTYPE>:\n${rendered.trim()}`
      );
    });
  }

  describe("the title it puts in content=\"…\"", () => {
    // Interior pages and the homepage assign pageTitle on separate lines; both
    // feed og:title, so both need pinning.
    const assignInterior = BASE_LIQUID.match(/^.*assign pageTitle = title.*$/m)?.[0];
    const assignHome = BASE_LIQUID.match(/^.*assign pageTitle = site\.site_name.*$/m)?.[0];

    const render = async (assign, title) =>
      liquid.parseAndRender(`${assign}{{ pageTitle }}`, {
        title,
        site: { site_name: "SJIF&R" },
      });

    it("both assigns were found in the layout", () => {
      assert.ok(assignInterior, "no interior `assign pageTitle = title` line");
      assert.ok(assignHome, "no homepage `assign pageTitle = site.site_name` line");
    });

    // pageTitle goes into og:title and twitter:title, so a quote in an editor's
    // post title would end those attributes early. Unlike the description this
    // is unencoded plain text, so a single `escape` is the right treatment —
    // asserting the exact string is what catches a second one being added.
    it("escapes an editor's title exactly once", async () => {
      assert.strictEqual(
        await render(assignInterior, "News & Announcements"),
        "News &amp; Announcements | SJIF&amp;R"
      );
      assert.strictEqual(
        await render(assignInterior, 'The "Big" One'),
        "The &#34;Big&#34; One | SJIF&amp;R"
      );
    });

    it("escapes the homepage title exactly once", async () => {
      assert.strictEqual(await render(assignHome, undefined), "SJIF&amp;R");
    });
  });

  describe("the description it puts in content=\"…\"", () => {
    // Read the real assign out of the layout rather than restating its filters,
    // so this can't pass against a pipeline the site no longer uses.
    // Both assigns: the first picks the source, the second sanitizes it.
    const assignPageDsc = BASE_LIQUID.match(/^.*assign pageDsc =.*$/gm)?.join("\n");
    const describeAs = async (description) =>
      liquid.parseAndRender(`${assignPageDsc}{{ pageDsc }}`, {
        description,
        site: { site_desc: "fallback" },
      });

    it("was found in the layout", () => {
      assert.ok(assignPageDsc, "no `assign pageDsc` line in base.liquid");
    });

    // A lede reaches this already rendered to HTML. Every one of these ends the
    // content="…" attribute early if it survives, spilling the rest into <head>.
    it("leaves no bare quote, whatever the lede rendered to", async () => {
      const ledes = [
        'Applications are <mark style={{ backgroundColor: "#FEF08A" }}>OPEN</mark> now.',
        "See the [docs](https://example.com) page",
        'Raw <span title="a>b">x</span> end',
        'He said "hello" and left',
      ];

      for (const lede of ledes) {
        const out = await describeAs(markdownify(lede));
        assert.doesNotMatch(out, /"/, `bare quote from: ${lede}`);
      }
    });

    it("keeps entities single-escaped rather than printing &amp;amp;", async () => {
      const out = await describeAs(markdownify("SJIF&R serves the island"));
      assert.match(out, /SJIF&amp;R/);
      assert.doesNotMatch(out, /&amp;amp;/);
    });

    it("falls back to the site description when a page has none", async () => {
      assert.strictEqual((await describeAs(undefined)).trim(), "fallback");
    });

    // An image-only lede markdownifies to `<p><img …></p>`, which is truthy —
    // so a `default` placed before strip_html would pass it through and ship a
    // description of pure whitespace.
    it("falls back when the lede strips to nothing, not just when it is absent", async () => {
      assert.strictEqual(await describeAs(markdownify("![alt text](photo.jpg)")), "fallback");
    });

    // Nothing but news-article.liquid sets a page-level description, so the
    // fallback is the live value on almost every page — it has to be sanitized
    // too, not trusted for being the default.
    it("sanitizes the fallback, which is what most pages actually ship", async () => {
      const out = await liquid.parseAndRender(`${assignPageDsc}{{ pageDsc }}`, {
        site: { site_desc: `The island's "first line" of response.` },
      });
      assert.doesNotMatch(out, /"/);
      assert.match(out, /&#?\w+;first/);
    });

    // markdownify leaves a newline between blocks, which would break the meta
    // tag across lines.
    it("collapses the newlines markdownify leaves between blocks", async () => {
      const out = await describeAs(markdownify("First para.\n\nSecond para."));
      assert.strictEqual(out, "First para. Second para.");
    });
  });
});
