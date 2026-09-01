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

describe("base.liquid", () => {
  // LiquidJS has no Jinja-style {# #} tag, so a comment written that way is
  // emitted verbatim — and anything emitted here lands before <!DOCTYPE html>,
  // which puts every page on the site into quirks mode. Nothing but template
  // syntax belongs above the doctype.
  it("emits nothing before the doctype", () => {
    const preamble = BASE_LIQUID.slice(0, BASE_LIQUID.indexOf("<!DOCTYPE"));
    const withoutLiquid = preamble
      .replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, "")
      .replace(/\{%[\s\S]*?%\}/g, "")
      .replace(/\{\{[\s\S]*?\}\}/g, "");

    assert.strictEqual(
      withoutLiquid.trim(),
      "",
      `base.liquid emits this before <!DOCTYPE>:\n${withoutLiquid.trim()}`
    );
  });

  describe("the description it puts in content=\"…\"", () => {
    // Read the real assign out of the layout rather than restating its filters,
    // so this can't pass against a pipeline the site no longer uses.
    const assignPageDsc = BASE_LIQUID.match(/^.*assign pageDsc =.*$/m)?.[0];
    const liquid = new Liquid();

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
  });
});
