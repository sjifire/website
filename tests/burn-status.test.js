const { describe, it } = require("node:test");
const assert = require("node:assert");
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const script = fs.readFileSync(
  path.join(__dirname, "../src/js/burn-status.js"),
  "utf-8"
);

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/agency-status.json"), "utf-8")
);

const WIDGET_HTML = `<!DOCTYPE html><html><body>
  <table class="widget widget--burn-status" data-burn-status aria-busy="true">
    <caption class="widget__header">
      <div class="timeframe" data-burn-season hidden>
        Burn Season: <span data-season-range></span>
      </div>
    </caption>
    <tbody class="widget__body" data-burn-body>
      <tr><th>Fire Danger</th>
        <td class="level level--unknown" data-row="fire-danger">&mdash;</td></tr>
      <tr data-aqi-row hidden>
        <th>Air Quality &amp; Smoke <aside data-aqi-source></aside></th>
        <td class="level" data-row="air-quality">
          <a href="#" target="_blank" rel="noopener" data-aqi-link>
            <span class="level__score" data-aqi-score></span>
            <span class="level__label" data-aqi-label></span>
          </a></td></tr>
      <tr><th>Residential Burn Permits</th>
        <td class="level level--unknown" data-row="residential">&mdash;</td></tr>
      <tr><th>Commercial Burn Permits</th>
        <td class="level level--unknown" data-row="commercial">&mdash;</td></tr>
      <tr><th>Recreational Fires: San Juan County</th>
        <td class="level level--unknown" data-row="recreational-county">&mdash;</td></tr>
      <tr><th>Recreational Fires: State Park &amp; DNR</th>
        <td class="level level--unknown" data-row="recreational-dnr">&mdash;</td></tr>
      <tr><th>Recreational Fires: National Parks</th>
        <td class="level level--unknown" data-row="recreational-nps">&mdash;</td></tr>
    </tbody>
  </table>
</body></html>`;

/**
 * Boots the widget in a fresh JSDOM with a stubbed fetch, then waits for the
 * script to finish patching. `responder` receives no args and returns whatever
 * the stubbed fetch should resolve/reject with.
 */
async function boot(responder) {
  const dom = new JSDOM(WIDGET_HTML, { runScripts: "dangerously" });
  dom.window.fetch = () => responder();
  const el = dom.window.document.createElement("script");
  el.textContent = script;
  dom.window.document.body.appendChild(el);
  await dom.window.__burnStatusReady;
  return dom.window.document;
}

/** A fetch stub that resolves with `body` as JSON and HTTP 200. */
function ok(body) {
  return () => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
}

const cell = (doc, row) => doc.querySelector(`[data-row="${row}"]`);

describe("Burn status widget", () => {
  it("patches every status row from the API payload", async () => {
    const doc = await boot(ok(fixture));

    assert.strictEqual(cell(doc, "fire-danger").textContent.trim(), "High");
    assert.ok(cell(doc, "fire-danger").className.includes("level--high"));

    assert.strictEqual(cell(doc, "residential").textContent.trim(), "Closed");
    assert.ok(cell(doc, "residential").className.includes("level--closed"));

    assert.strictEqual(cell(doc, "commercial").textContent.trim(), "Closed");
    assert.strictEqual(cell(doc, "recreational-county").textContent.trim(), "Open");
    assert.ok(cell(doc, "recreational-county").className.includes("level--open"));
    assert.strictEqual(cell(doc, "recreational-dnr").textContent.trim(), "Closed");
    assert.strictEqual(cell(doc, "recreational-nps").textContent.trim(), "Closed");
  });

  it("renders the burn season in UTC, not local time", async () => {
    const doc = await boot(ok(fixture));
    const season = doc.querySelector("[data-burn-season]");
    assert.strictEqual(season.hidden, false);
    // 2026-10-06 / 2027-06-05 -- must not slip to Oct 5 / Jun 4 in Pacific time
    assert.strictEqual(
      doc.querySelector("[data-season-range]").textContent.trim(),
      "Oct 6-Jun 5"
    );
  });

  it("fills and reveals the air quality row", async () => {
    const doc = await boot(ok(fixture));
    const row = doc.querySelector("[data-aqi-row]");
    assert.strictEqual(row.hidden, false);
    assert.strictEqual(doc.querySelector("[data-aqi-score]").textContent, "17");
    assert.strictEqual(
      doc.querySelector("[data-aqi-label]").textContent,
      "AQI · Good"
    );
    assert.ok(
      cell(doc, "air-quality").className.includes("level--aqi-good")
    );
    assert.strictEqual(
      doc.querySelector("[data-aqi-link]").getAttribute("href"),
      "https://www.airnow.gov/?reportingArea=Anacortes&stateCode=WA"
    );
    assert.match(
      doc.querySelector("[data-aqi-source]").textContent,
      /Nearest monitor: Anacortes/
    );
  });

  it("clears aria-busy once patched", async () => {
    const doc = await boot(ok(fixture));
    assert.strictEqual(
      doc.querySelector("[data-burn-status]").hasAttribute("aria-busy"),
      false
    );
  });
});
