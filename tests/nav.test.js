const { describe, it } = require("node:test");
const assert = require("node:assert");
const { resolveHighlightLabel, buildHeaderHighlight } = require("../src/_lib/nav-utils");

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

  it("returns null when there is no label and no page", () => {
    assert.strictEqual(resolveHighlightLabel(undefined, null), null);
  });
});

describe("buildHeaderHighlight", () => {
  const joinPage = { title: "Join Us", nav_title: "Join Us", url: "/join/" };
  const lookupJoin = (url) => (url === "/join/" ? joinPage : null);

  it("returns null when no highlight URL is configured", () => {
    assert.strictEqual(buildHeaderHighlight("", "Apply Now", lookupJoin), null);
  });

  it("returns null when the linked page does not exist", () => {
    // Fail safe: an editor pointing the highlight at a missing page hides the
    // button rather than shipping a sitewide link to a 404.
    assert.strictEqual(buildHeaderHighlight("/about/join/", "Apply Now", lookupJoin), null);
  });

  it("uses the configured label for the button", () => {
    const highlight = buildHeaderHighlight("/join/", "APPLY NOW FOR OUR 2027 ACADEMY", lookupJoin);
    assert.strictEqual(highlight.label, "APPLY NOW FOR OUR 2027 ACADEMY");
    assert.strictEqual(highlight.url, "/join/");
  });

  it("keeps the page nav_title alongside the button label, for the footer", () => {
    const highlight = buildHeaderHighlight("/join/", "APPLY NOW FOR OUR 2027 ACADEMY", lookupJoin);
    assert.strictEqual(highlight.nav_title, "Join Us");
  });

  it("falls back to the page nav_title when no label is configured", () => {
    const highlight = buildHeaderHighlight("/join/", "", lookupJoin);
    assert.strictEqual(highlight.label, "Join Us");
  });

  it("returns null when the page resolves but yields no usable label", () => {
    const untitled = (url) => (url === "/join/" ? { url } : null);
    assert.strictEqual(buildHeaderHighlight("/join/", "", untitled), null);
  });
});
