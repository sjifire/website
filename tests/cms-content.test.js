const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Liquid } = require("liquidjs");
const { Eleventy } = require("@11ty/eleventy");
const {
  LIQUID_ENABLED_PAGES,
  usesLiquid,
  templateEngineFor,
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

  describe("templateEngineFor", () => {
    it("compiles CMS pages as markdown only, with no Liquid to execute", () => {
      assert.strictEqual(templateEngineFor("./src/pages/join.mdx"), "md");
      assert.strictEqual(templateEngineFor("./src/pages/about/about.mdx"), "md");
    });

    it("leaves allow-listed pages on Eleventy's default so their Liquid runs", () => {
      assert.strictEqual(templateEngineFor("./src/pages/about/governance.mdx"), undefined);
      assert.strictEqual(
        templateEngineFor("./src/pages/about/key-information.mdx"),
        undefined
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

    // Excluding ":" alone caught only the first of these: a protocol-relative
    // URL carries no scheme, and a relative one carries no slash either.
    it("refuses every url() value, however the host is spelled", () => {
      const values = [
        "url(https://evil.example/x.png)",
        "url(//evil.example/x.png)",
        "url(x.png)",
        "URL(x.png)",
        "url (x.png)",
      ];
      for (const value of values) {
        const beacon = `<mark style={{ backgroundImage: "${value}" }}>x</mark>`;
        assert.strictEqual(normalizeJsxStyleAttributes(beacon), beacon, value);
      }
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

  // Why CMS pages are kept off Liquid entirely: this is what an editor's
  // pasted highlight does to the engine that used to compile them.
  describe("why Liquid is not run on CMS content", () => {
    const liquid = new Liquid();

    it("a pasted highlight makes Liquid throw", async () => {
      await assert.rejects(
        () => liquid.parseAndRender(PASTED_HIGHLIGHT),
        /expected "\|" before filter/
      );
    });

    // The hole this replaces: {% raw %} is only as strong as a delimiter the
    // editor cannot type, and they can type any of them.
    it("a raw block is escapable by content containing {% endraw %}", async () => {
      const typed = "before {% endraw %}{{ 1 | plus: 2 }}{% raw %} after";
      const out = await liquid.parseAndRender(`{% raw %}${typed}{% endraw %}`);
      assert.strictEqual(out, "before 3 after");
    });
  });

  // The preprocessor registered in .eleventy.js is what applies all of the
  // above, so assert against the real config rather than a copy of it.
  describe("as wired into .eleventy.js", () => {
    const mdxPreprocessor = (() => {
      let captured;
      const stub = new Proxy(
        {},
        {
          get: (_target, property) =>
            property === "addPreprocessor"
              ? (_name, extensions, fn) => {
                  if (extensions === "mdx") captured = fn;
                }
              : () => stub,
        }
      );
      require("../.eleventy.js")(stub);
      return captured;
    })();

    const run = (inputPath, content) => {
      const data = { page: { inputPath } };
      return { data, output: mdxPreprocessor(data, content) };
    };

    it("is registered for mdx", () => {
      assert.strictEqual(typeof mdxPreprocessor, "function");
    });

    it("compiles a CMS page as markdown only", () => {
      const { data } = run("./src/pages/join.mdx", "body");
      assert.strictEqual(data.templateEngineOverride, "md");
    });

    it("does not override the engine on an allow-listed page", () => {
      const { data } = run("./src/pages/about/key-information.mdx", "body");
      assert.strictEqual(data.templateEngineOverride, undefined);
    });

    // Front matter must not become a second switch in either direction: one
    // spelling would re-expose a CMS page to Liquid, the other would ship an
    // allow-listed page's {{ personnel.counts.* }} to the public as text.
    it("overrules a templateEngineOverride set in front matter, both ways", () => {
      const cms = { page: { inputPath: "./src/pages/join.mdx" }, templateEngineOverride: "liquid,md" };
      mdxPreprocessor(cms, "body");
      assert.strictEqual(cms.templateEngineOverride, "md");

      const allowed = {
        page: { inputPath: "./src/pages/about/key-information.mdx" },
        templateEngineOverride: "md",
      };
      mdxPreprocessor(allowed, "body");
      assert.strictEqual("templateEngineOverride" in allowed, false);
    });

    it("emits no raw block, so there is none for an editor to close early", () => {
      const typed = "before {% endraw %}{{ 1 | plus: 2 }}{% raw %} after";
      const { output } = run("./src/pages/join.mdx", typed);
      assert.strictEqual(output, typed);
    });

    it("normalizes the pasted highlight on the way through", () => {
      const { output } = run("./src/pages/join.mdx", PASTED_HIGHLIGHT);
      assert.strictEqual(
        output,
        'APPLICATIONS ARE **<mark style="background-color: #FEF08A">OPEN</mark>**'
      );
    });

    it("normalizes allow-listed pages too, which still run Liquid", () => {
      const { output } = run("./src/pages/about/governance.mdx", PASTED_HIGHLIGHT);
      assert.strictEqual(
        output,
        'APPLICATIONS ARE **<mark style="background-color: #FEF08A">OPEN</mark>**'
      );
    });
  });

  // Everything above asserts that the override is *assigned*. That an assignment
  // made inside a preprocessor is still honoured is an ordering dependency on
  // Eleventy internals that no documentation promises: Template.getTemplates
  // runs preprocessors against the same data object TemplateContent._render
  // later reads. If an upgrade resolved the engine first, every other test here
  // would stay green while CMS pages quietly became Liquid templates again, and
  // the next "{{" an editor typed in Tina would break production. So build one
  // through Eleventy for real.
  describe("through a real Eleventy build", () => {
    const TYPED = "Literal {{ 1 | plus: 2 }} and {% endraw %} and {% if true %}X{% endif %}";

    // Installs the very preprocessor .eleventy.js registers, lifted out with
    // the same stub used above, rather than a copy of it — a copy would keep
    // passing if the real registration moved somewhere Eleventy resolves too
    // late. The site's own config can't be loaded wholesale here: it pins
    // dir.input to src/ and wants _includes, _data and Cloudinary config that a
    // tmpdir hasn't got. `withPreprocessor: false` is the control.
    const fixtureConfig = (withPreprocessor) => `
      const eleventyPath = ${JSON.stringify(path.resolve(__dirname, "../.eleventy.js"))};
      module.exports = function (eleventyConfig) {
        eleventyConfig.setTemplateFormats(["mdx"]);
        eleventyConfig.addExtension("mdx", { key: "md" });
        ${
          withPreprocessor
            ? `
        let real;
        const stub = new Proxy({}, {
          get: (_t, property) =>
            property === "addPreprocessor"
              ? (_name, extensions, fn) => { if (extensions === "mdx") real = fn; }
              : () => stub,
        });
        require(eleventyPath)(stub);
        eleventyConfig.addPreprocessor("protect-cms-content", "mdx", real);`
            : ""
        }
      };
    `;

    async function buildFixture(withPreprocessor) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cms-content-"));
      try {
        fs.writeFileSync(path.join(dir, "probe.mdx"), `${TYPED}\n`);
        const configPath = path.join(dir, "eleventy.config.cjs");
        fs.writeFileSync(configPath, fixtureConfig(withPreprocessor));
        const eleventy = new Eleventy(dir, path.join(dir, "_out"), { configPath });
        // The control is expected to fail; without this Eleventy prints its
        // whole error report to stderr in the middle of a passing run.
        eleventy.disableLogger();
        const results = await eleventy.toJSON();
        return results.map((result) => result.content).join("");
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }

    it("renders what an editor typed as text, with no Liquid executed", async () => {
      const html = await buildFixture(true);
      assert.match(html, /Literal \{\{ 1 \| plus: 2 \}\}/);
      assert.match(html, /\{% endraw %\}/);
      assert.match(html, /\{% if true %\}X\{% endif %\}/);
      assert.doesNotMatch(html, /Literal 3/);
    });

    // Without the preprocessor the same page is a Liquid template and blows up
    // on the unmatched {% endraw %} — which is what makes the assertion above
    // mean something rather than passing for an unrelated reason.
    it("is the preprocessor doing that, not markdown being harmless", async () => {
      await assert.rejects(
        () => buildFixture(false),
        /Having trouble rendering liquid template/
      );
    });
  });
});
