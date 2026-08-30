const { describe, it } = require("node:test");
const assert = require("node:assert");
const { Liquid } = require("liquidjs");
const {
  LIQUID_ENABLED_PAGES,
  usesLiquid,
  protectCmsContent,
} = require("../src/_lib/cms-content");

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
      const out = protectCmsContent("./src/pages/join.mdx", PASTED_HIGHLIGHT);
      assert.strictEqual(out, `{% raw %}${PASTED_HIGHLIGHT}{% endraw %}`);
    });

    it("leaves allow-listed pages untouched so their Liquid still runs", () => {
      const body = "Count: {{ personnel.counts.volunteerFirefighters }}";
      assert.strictEqual(
        protectCmsContent("./src/pages/about/key-information.mdx", body),
        body
      );
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

    it("protected CMS content renders the braces literally", async () => {
      const out = await liquid.parseAndRender(
        protectCmsContent("./src/pages/join.mdx", PASTED_HIGHLIGHT)
      );
      assert.strictEqual(out, PASTED_HIGHLIGHT);
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
