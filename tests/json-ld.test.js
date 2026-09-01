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

  // Every kind of break is a word boundary. Dropping them welded words
  // together — a real lede reading "Wildland Team\nFire Simulation" shipped as
  // "TeamFire Simulation".
  it("treats every kind of line break as a word boundary", () => {
    assert.strictEqual(markdownToPlainText("Team \nFire Simulation"), "Team Fire Simulation");
    assert.strictEqual(markdownToPlainText("Line one  \nLine two"), "Line one Line two");
    assert.strictEqual(markdownToPlainText("Team<br>Fire"), "Team Fire");
    assert.strictEqual(markdownToPlainText("Team<br />Fire"), "Team Fire");
    // A paste from Word or Docs carries attributes on it.
    assert.strictEqual(markdownToPlainText('Team<br class="x">Fire'), "Team Fire");
  });

  it("reads a fenced or indented block, whose content is literal text", () => {
    assert.strictEqual(markdownToPlainText("```\ncode here\n```"), "code here");
    assert.strictEqual(markdownToPlainText("    indented code"), "indented code");
  });

  // Deliberately nothing, so the caller falls back to the headline. Extracting
  // this with a regex was tried and withdrawn: each of these published
  // something the page hides, or deleted words that it shows.
  it("yields nothing for a pasted HTML block rather than guessing at it", () => {
    for (const pasted of [
      "<p>Hello world</p>",
      "<!-- internal note: draft > final -->",
      "<style>\n.lede{color:red}\n</style>",
      "<style>\n.lede{color:red}",
      "<noscript>hidden fallback</noscript>",
      "<p>5 < 10</p><p>more text</p>",
      "<p>First.<p>Second.",
    ]) {
      assert.strictEqual(markdownToPlainText(pasted), "", pasted);
    }
  });

  // These are inline, not a block, so the prose around them is real content —
  // only the hidden element's own body has to go.
  it("keeps prose around an inline hidden element but drops its body", () => {
    assert.strictEqual(
      markdownToPlainText("Real text <script>alert(1)</script> more"),
      "Real text more"
    );
    assert.strictEqual(
      markdownToPlainText("Real text <style>.x{color:red}</style> more"),
      "Real text more"
    );
    assert.strictEqual(
      markdownToPlainText("Real <template>hidden</template> text"),
      "Real text"
    );
  });

  // JavaScript's \s matches U+FEFF, so collapsing whitespace turned an
  // invisible character in a real post's lede into a visible space.
  it("removes zero-width characters instead of collapsing them to a space", () => {
    assert.strictEqual(markdownToPlainText("S\uFEFFtuart Island"), "Stuart Island");
    assert.strictEqual(markdownToPlainText("a\u200Bb"), "ab");
  });

  // U+200C and U+200D are joiners, not stray whitespace: stripping ZWJ split
  // the firefighter emoji into a man and a fire engine.
  it("leaves joining characters alone, so emoji sequences survive", () => {
    const firefighter = "Our \u{1F468}\u200D\u{1F692} crew";
    assert.strictEqual(markdownToPlainText(firefighter), firefighter);
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
