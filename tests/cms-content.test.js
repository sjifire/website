const { describe, it } = require("node:test");
const assert = require("node:assert");
const { Liquid } = require("liquidjs");
const {
  LIQUID_ENABLED_PAGES,
  usesLiquid,
  protectCmsContent,
  normalizeJsxStyleAttributes,
} = require("../src/_lib/cms-content");
const { markdownify } = require("../src/_lib/markdown");

// The exact markup TinaCMS wrote into src/pages/join.mdx on 2026-08-30 after
// an editor pasted highlighted text. Liquid reads `{{ backgroundColor: ... }}`
// as an output tag and throws, which broke the main build for every commit
// until it was hand-edited out.
const PASTED_HIGHLIGHT =
  'APPLICATIONS ARE **<mark style={{ backgroundColor: "#FEF08A" }}>OPEN</mark>**';

describe("cms-content", () => {
  describe("usesLiquid", () => {
    it("recognises the allow-listed pages by repo-relative path", () => {
      for (const page of LIQUID_ENABLED_PAGES) {
        assert.strictEqual(usesLiquid(page), true, page);
      }
    });

    it("accepts the ./-prefixed inputPath Eleventy passes to preprocessors", () => {
      assert.strictEqual(usesLiquid("./src/pages/about/governance.mdx"), true);
      assert.strictEqual(usesLiquid("./src/pages/about/key-information.mdx"), true);
    });

    it("treats every other page as CMS content", () => {
      assert.strictEqual(usesLiquid("./src/pages/join.mdx"), false);
      assert.strictEqual(usesLiquid("./src/pages/about/about.mdx"), false);
    });
  });

  describe("protectCmsContent", () => {
    it("wraps CMS pages in a Liquid raw block", () => {
      const out = protectCmsContent("./src/pages/join.mdx", "plain body");
      assert.strictEqual(out, "{% raw %}plain body{% endraw %}");
    });

    it("normalizes JSX style attributes inside the raw block", () => {
      const out = protectCmsContent("./src/pages/join.mdx", PASTED_HIGHLIGHT);
      assert.strictEqual(
        out,
        '{% raw %}APPLICATIONS ARE **<mark style="background-color: #FEF08A">OPEN</mark>**{% endraw %}'
      );
    });

    it("leaves allow-listed pages untouched so their Liquid still runs", () => {
      const body = "Count: {{ personnel.counts.volunteerFirefighters }}";
      assert.strictEqual(
        protectCmsContent("./src/pages/about/key-information.mdx", body),
        body
      );
    });

    // Allow-listed pages are Tina-editable too and get no {% raw %} to fall
    // back on, so a pasted highlight there would reach Liquid and break the
    // build. Normalizing removes the braces before that can happen.
    it("still normalizes allow-listed pages, which have no raw block to save them", () => {
      assert.strictEqual(
        protectCmsContent("./src/pages/about/governance.mdx", PASTED_HIGHLIGHT),
        'APPLICATIONS ARE **<mark style="background-color: #FEF08A">OPEN</mark>**'
      );
    });
  });

  describe("normalizeJsxStyleAttributes", () => {
    it("rewrites the highlight TinaCMS writes into a plain HTML style attribute", () => {
      assert.strictEqual(
        normalizeJsxStyleAttributes(PASTED_HIGHLIGHT),
        'APPLICATIONS ARE **<mark style="background-color: #FEF08A">OPEN</mark>**'
      );
    });

    it("kebab-cases every camelCase property and joins declarations with ;", () => {
      assert.strictEqual(
        normalizeJsxStyleAttributes(
          '<span style={{ backgroundColor: "#FEF08A", fontWeight: "bold" }}>hi</span>'
        ),
        '<span style="background-color: #FEF08A; font-weight: bold">hi</span>'
      );
    });

    it("accepts single-quoted values and already-kebab-cased keys", () => {
      assert.strictEqual(
        normalizeJsxStyleAttributes("<mark style={{ 'background-color': '#FEF08A' }}>x</mark>"),
        '<mark style="background-color: #FEF08A">x</mark>'
      );
    });

    it("leaves shapes it does not understand alone rather than guessing", () => {
      const dynamic = "<mark style={{ backgroundColor: color }}>x</mark>";
      assert.strictEqual(normalizeJsxStyleAttributes(dynamic), dynamic);

      // React would append "px"; guessing units is not this function's job.
      const unitless = "<mark style={{ fontSize: 12 }}>x</mark>";
      assert.strictEqual(normalizeJsxStyleAttributes(unitless), unitless);
    });

    it("does not touch plain HTML style attributes or ordinary Liquid braces", () => {
      const plain = '<mark style="background-color: #FEF08A">x</mark>';
      assert.strictEqual(normalizeJsxStyleAttributes(plain), plain);

      const liquid = "Volunteers: {{ personnel.counts.volunteerFirefighters }}";
      assert.strictEqual(normalizeJsxStyleAttributes(liquid), liquid);
    });

    // Single-quoted, so the value parses cleanly and reaches the value check.
    // The double-quoted spelling of this is rejected earlier, by the parser, so
    // it would pass even with the value check deleted — it proves nothing.
    it("refuses a value whose quote would end the attribute early", () => {
      const injected =
        "<mark style={{ backgroundColor: 'red\" onmouseover=\"alert(1)' }}>x</mark>";
      assert.strictEqual(normalizeJsxStyleAttributes(injected), injected);
    });

    it("refuses a value whose semicolon would append declarations nobody typed", () => {
      const overlay =
        '<mark style={{ backgroundColor: "red; position:fixed; top:0; width:100vw" }}>x</mark>';
      assert.strictEqual(normalizeJsxStyleAttributes(overlay), overlay);
    });

    it("refuses a url() value that would beacon a host the CSP never allowed", () => {
      const beacon =
        '<mark style={{ backgroundImage: "url(https://evil.example/x.png)" }}>x</mark>';
      assert.strictEqual(normalizeJsxStyleAttributes(beacon), beacon);
    });

    it("refuses an empty value rather than emitting a valueless declaration", () => {
      const empty = '<mark style={{ backgroundColor: "" }}>x</mark>';
      assert.strictEqual(normalizeJsxStyleAttributes(empty), empty);
    });

    it("accepts a trailing comma and newlines, as a prettifier would write them", () => {
      assert.strictEqual(
        normalizeJsxStyleAttributes('<mark style={{ backgroundColor: "#FEF08A", }}>x</mark>'),
        '<mark style="background-color: #FEF08A">x</mark>'
      );
      assert.strictEqual(
        normalizeJsxStyleAttributes(
          '<mark style={{\n  backgroundColor: "#FEF08A",\n  color: "red",\n}}>x</mark>'
        ),
        '<mark style="background-color: #FEF08A; color: red">x</mark>'
      );
    });

    it("kebab-cases a quoted key too, since quoting is only formatting", () => {
      assert.strictEqual(
        normalizeJsxStyleAttributes("<mark style={{ 'backgroundColor': '#fff' }}>x</mark>"),
        '<mark style="background-color: #fff">x</mark>'
      );
    });

    it("keeps functional notation and lengths, which are ordinary CSS values", () => {
      assert.strictEqual(
        normalizeJsxStyleAttributes(
          '<mark style={{ backgroundColor: "rgba(255, 255, 0, .5)", fontSize: "1.5em" }}>x</mark>'
        ),
        '<mark style="background-color: rgba(255, 255, 0, .5); font-size: 1.5em">x</mark>'
      );
    });
  });

  describe("through markdown-it", () => {
    // Normalization now runs in two places (the mdx preprocessor and this
    // filter), so running it twice has to be a no-op.
    it("is idempotent, since two entry points now normalize", () => {
      const once = normalizeJsxStyleAttributes(PASTED_HIGHLIGHT);
      assert.strictEqual(normalizeJsxStyleAttributes(once), once);
      assert.match(markdownify(once), /<mark style="background-color: #FEF08A">OPEN<\/mark>/);
    });

    // markdownify is the whole render path for Tina rich-text that lives in
    // front matter (join.mdx's sidebar_blocks) and in JSON collections (a
    // post's lede and body) — none of which the mdx preprocessor ever sees.
    it("normalizes on its own, for the fields the preprocessor never sees", () => {
      const html = markdownify(PASTED_HIGHLIGHT);
      assert.match(html, /<mark style="background-color: #FEF08A">OPEN<\/mark>/);
      assert.doesNotMatch(html, /&lt;mark/);
    });

    it("leaves a highlight it cannot normalize as text rather than mangling it", () => {
      const html = markdownify('<mark style={{ backgroundColor: "a; b" }}>OPEN</mark>');
      assert.match(html, /&lt;mark/);
    });
  });

  describe("through the Liquid engine", () => {
    const liquid = new Liquid();

    it("documents the failure: unprotected pasted JSX makes Liquid throw", async () => {
      await assert.rejects(
        () => liquid.parseAndRender(PASTED_HIGHLIGHT),
        /expected "\|" before filter/
      );
    });

    it("hands the pasted highlight to markdown as plain HTML", async () => {
      const out = await liquid.parseAndRender(
        protectCmsContent("./src/pages/join.mdx", PASTED_HIGHLIGHT)
      );
      assert.strictEqual(
        out,
        'APPLICATIONS ARE **<mark style="background-color: #FEF08A">OPEN</mark>**'
      );
    });

    it("still renders braces it cannot normalize literally instead of throwing", async () => {
      const body = 'Pasted: <mark style={{ backgroundColor: color }}>OPEN</mark>';
      const out = await liquid.parseAndRender(
        protectCmsContent("./src/pages/join.mdx", body)
      );
      assert.strictEqual(out, body);
    });

    it("protected CMS content also survives Liquid tag syntax", async () => {
      const body = "Use {% include 'x' %} literally, and {{ this }} too.";
      const out = await liquid.parseAndRender(
        protectCmsContent("./src/pages/join.mdx", body)
      );
      assert.strictEqual(out, body);
    });

    it("allow-listed pages still evaluate Liquid", async () => {
      const out = await liquid.parseAndRender(
        protectCmsContent(
          "./src/pages/about/key-information.mdx",
          "Volunteers: {{ counts.volunteers }}"
        ),
        { counts: { volunteers: 42 } }
      );
      assert.strictEqual(out, "Volunteers: 42");
    });
  });
});
