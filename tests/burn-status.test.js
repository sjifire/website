const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

// The <burn-status> embed is loaded from one host and fetches from another.
// eleventy --serve sends no globalHeaders, so the CSP is only enforced on
// deployed Azure: a missing origin here passes every e2e test and then shows
// a blank widget in production. Check it statically instead.
const site = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../src/_data/site.json"), "utf-8")
);
const swa = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../staticwebapp.config.json"), "utf-8")
);
const csp = swa.globalHeaders["Content-Security-Policy"];

function directive(name) {
  const match = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(name + " "));
  assert.ok(match, `CSP has no ${name}`);
  return match.split(/\s+/).slice(1);
}

describe("Fire Safety widget config", () => {
  it("has an agency id and a publishable key", () => {
    assert.match(site.burn_widget.agency_id, /^[0-9a-f-]{36}$/);
    // pk_live_ keys are safe in page source; anything else is not.
    assert.match(site.burn_widget.key, /^pk_live_/);
  });

  it("CSP script-src allows the widget script's origin", () => {
    assert.ok(directive("script-src").includes(new URL(site.burn_widget.script).origin));
  });

  it("CSP connect-src allows the API the widget fetches from", () => {
    // The widget's built-in default endpoint; we never override data-endpoint.
    assert.ok(directive("connect-src").includes("https://api.stationworks.app"));
  });

  it("redirects the retired burn page to the permits portal", () => {
    for (const route of ["/services/burn-permits", "/services/burn-permits/"]) {
      const rule = swa.routes.find((r) => r.route === route);
      assert.ok(rule, `no route for ${route}`);
      assert.strictEqual(rule.redirect, site.permits_url);
      assert.strictEqual(rule.statusCode, 301);
    }
  });
});
