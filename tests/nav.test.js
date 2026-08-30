const { describe, it } = require("node:test");
const assert = require("node:assert");
const { resolveHighlightLabel } = require("../src/_lib/nav-utils");

describe("resolveHighlightLabel", () => {
  const pageInfo = { title: "Join Us", nav_title: "Volunteer" };

  it("prefers the label configured in navigation.json", () => {
    assert.strictEqual(
      resolveHighlightLabel("APPLY NOW FOR OUR 2027 ACADEMY", pageInfo),
      "APPLY NOW FOR OUR 2027 ACADEMY"
    );
  });

  it("trims surrounding whitespace from the configured label", () => {
    assert.strictEqual(resolveHighlightLabel("  Apply Now  ", pageInfo), "Apply Now");
  });

  it("falls back to the page nav_title when the label is blank", () => {
    assert.strictEqual(resolveHighlightLabel("", pageInfo), "Volunteer");
  });

  it("falls back to the page nav_title when the label is only whitespace", () => {
    assert.strictEqual(resolveHighlightLabel("   ", pageInfo), "Volunteer");
  });

  it("falls back to the page nav_title when the label is undefined", () => {
    assert.strictEqual(resolveHighlightLabel(undefined, pageInfo), "Volunteer");
  });

  it("falls back to the page title when the page has no nav_title", () => {
    assert.strictEqual(resolveHighlightLabel(undefined, { title: "Join Us" }), "Join Us");
  });

  it("returns null when there is no label and no page info", () => {
    assert.strictEqual(resolveHighlightLabel(undefined, null), null);
  });

  it("uses the configured label even when the page cannot be resolved", () => {
    assert.strictEqual(resolveHighlightLabel("Apply Now", null), "Apply Now");
  });
});
