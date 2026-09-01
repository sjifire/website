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

    it("refuses values carrying characters that would break out of the attribute", () => {
      const injected =
        '<mark style={{ backgroundColor: "red\\" onmouseover=\\"alert(1)" }}>x</mark>';
      assert.strictEqual(normalizeJsxStyleAttributes(injected), injected);
    });
  });

  describe("through markdown-it", () => {
    it("renders the pasted highlight as a real <mark>, not escaped text", () => {
      const html = markdownify(normalizeJsxStyleAttributes(PASTED_HIGHLIGHT));
      assert.match(html, /<mark style="background-color: #FEF08A">OPEN<\/mark>/);
      assert.doesNotMatch(html, /&lt;mark/);
    });

    it("documents the bug: untouched JSX escapes the open tag and strands </mark>", () => {
      const html = markdownify(PASTED_HIGHLIGHT);
      assert.match(html, /&lt;mark/);
      assert.match(html, /<\/mark>/);
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
