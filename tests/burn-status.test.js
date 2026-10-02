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

  it("does not redirect the Burn Information page away", () => {
    // The page was briefly retired in favor of the portal; a leftover redirect
    // would hide it.
    const rule = swa.routes.find((r) => r.route.startsWith("/services/burn-permits"));
    assert.strictEqual(rule, undefined);
  });
});

describe("staticwebapp.config.json routes", () => {
  // Azure treats /x and /x/ as the same route and rejects the whole deploy on
  // a duplicate ("A rule was already processed with a duplicate route").
  // Nothing local validates this file, so catch it here.
  it("has no duplicate routes, ignoring a trailing slash", () => {
    const seen = new Map();
    for (const { route } of swa.routes) {
      const key = route.length > 1 ? route.replace(/\/$/, "") : route;
      assert.ok(!seen.has(key), `duplicate route: ${seen.get(key)} and ${route}`);
      seen.set(key, route);
    }
  });
});
