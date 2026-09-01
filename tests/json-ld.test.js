const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { jsonLd } = require("../src/_lib/json-ld");
const { markdownToPlainText } = require("../src/_lib/markdown");

describe("jsonLd", () => {
  it("emits a quoted JSON string, so templates interpolate it bare", () => {
    assert.strictEqual(jsonLd("Boat Rescue"), '"Boat Rescue"');
  });

  // A script body is raw text: the HTML parser does not decode entities there,
  // so `escape` was sending consumers the literal `Meet &amp; Greet`.
  it("leaves an ampersand decoded, unlike escape", () => {
    assert.strictEqual(jsonLd("Meet & Greet"), '"Meet & Greet"');
  });

  // These are the characters `escape` left alone and JSON cares about; each one
  // made the block invalid JSON, and a parser that rejects it drops everything.
  it("escapes what makes JSON invalid, and stays parseable", () => {
    for (const value of ['He said "hi"', "back\\slash", "line\nbreak", "tab\there"]) {
      const emitted = jsonLd(value);
      assert.strictEqual(JSON.parse(emitted), value, value);
    }
  });

  // The one case here that is a vulnerability rather than a correctness bug.
  it("cannot close the script element from inside a string", () => {
    const emitted = jsonLd("Title </script><script>alert(1)</script> end");
    assert.doesNotMatch(emitted, /<\/script/i);
    assert.strictEqual(JSON.parse(emitted), "Title </script><script>alert(1)</script> end");
  });

  it("treats a missing value as an empty string rather than emitting null", () => {
    assert.strictEqual(jsonLd(undefined), '""');
    assert.strictEqual(jsonLd(null), '""');
  });
});

describe("markdownToPlainText", () => {
  it("keeps entities decoded, which is the point of using it over markdownify", () => {
    assert.strictEqual(markdownToPlainText("Meet & Greet"), "Meet & Greet");
  });

  it("drops markup and keeps the words", () => {
    assert.strictEqual(
      markdownToPlainText("See the [docs](https://example.com) page for **details**."),
      "See the docs page for details."
    );
  });

  it("separates blocks instead of running them together", () => {
    assert.strictEqual(
      markdownToPlainText("First para.\n\nSecond para."),
      "First para. Second para."
    );
  });

  it("strips a pasted highlight along with its attribute", () => {
    assert.strictEqual(
      markdownToPlainText('Are <mark style={{ backgroundColor: "#FEF08A" }}>OPEN</mark> now'),
      "Are OPEN now"
    );
  });

  it("returns an empty string for no input", () => {
    for (const empty of [undefined, null, ""]) {
      assert.strictEqual(markdownToPlainText(empty), "");
    }
  });
});

// The property that actually matters, asserted against what the site ships.
describe("every JSON-LD block in the built site", () => {
  const siteDir = path.resolve(__dirname, "../_site");
  const blocks = [];

  if (fs.existsSync(siteDir)) {
    const walk = (dir) =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return entry.name.endsWith(".html") ? [full] : [];
      });

    for (const file of walk(siteDir)) {
      const html = fs.readFileSync(file, "utf8");
      const pattern = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
      let match;
      while ((match = pattern.exec(html)) !== null) {
        blocks.push({ file: path.relative(siteDir, file), body: match[1] });
      }
    }
  }

  // Skipped rather than failed when _site is absent: `npm run test:unit` is run
  // on its own locally. CI builds first, so it is covered there.
  it("parses as JSON, with no HTML entities left in the values", { skip: blocks.length === 0 }, () => {
    for (const { file, body } of blocks) {
      let parsed;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(body);
      }, `invalid JSON-LD in ${file}`);
      assert.doesNotMatch(
        JSON.stringify(parsed),
        /&(amp|quot|lt|gt|#\d+);/,
        `HTML entity in JSON-LD in ${file}`
      );
    }
  });
});
