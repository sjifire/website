const { describe, it } = require("node:test");
const assert = require("node:assert");
const { createMarkdownRenderer, markdownify } = require("../src/_lib/markdown");

describe("markdownify", () => {
  describe("input handling", () => {
    it("returns undefined for null input", () => {
      assert.strictEqual(markdownify(null), undefined);
    });

    it("returns undefined for undefined input", () => {
      assert.strictEqual(markdownify(undefined), undefined);
    });

    it("returns undefined for empty string", () => {
      assert.strictEqual(markdownify(""), undefined);
    });
  });

  describe("autolinking", () => {
    // Regression guard: markdown-it 15 ships linkify-it 6, which flipped the
    // fuzzyLink default to false. That silently turned bare www. URLs in
    // published posts and the RSS feed into plain text. See tests below for
    // the exact shapes the site's content relies on.
    it("links bare www. URLs", () => {
      assert.match(
        markdownify("Be prepared (www.islandsready.org) – have a plan."),
        /<a href="http:\/\/www\.islandsready\.org">www\.islandsready\.org<\/a>/
      );
    });

    it("links bare domains without a www prefix", () => {
      assert.match(
        markdownify("See example.org for details."),
        /<a href="http:\/\/example\.org">example\.org<\/a>/
      );
    });

    it("links explicit-protocol URLs", () => {
      assert.match(
        markdownify("Visit https://sjifire.org today."),
        /<a href="https:\/\/sjifire\.org">https:\/\/sjifire\.org<\/a>/
      );
    });

    it("leaves existing markdown links intact", () => {
      assert.match(
        markdownify("[our site](https://sjifire.org)"),
        /<a href="https:\/\/sjifire\.org">our site<\/a>/
      );
    });
  });

  describe("configured options", () => {
    it("converts single newlines to <br> (breaks)", () => {
      assert.match(markdownify("line one\nline two"), /<br\s*\/?>/);
    });

    it("applies typographic replacements", () => {
      assert.match(markdownify("Fire -- Rescue..."), /–|…/);
    });

    it("passes through inline HTML", () => {
      assert.match(markdownify('<span class="x">hi</span>'), /<span class="x">hi<\/span>/);
    });

    it("supports markdown-it-attrs", () => {
      assert.match(markdownify("# Title {.headline}"), /class="headline"/);
    });
  });

  describe("createMarkdownRenderer", () => {
    it("returns a renderer with fuzzy linking enabled", () => {
      const md = createMarkdownRenderer();
      assert.strictEqual(md.linkify.test("www.islandsready.org"), true);
    });
  });
});
