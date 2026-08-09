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

describe("aria-busy lifecycle", () => {
  it("sets aria-busy itself, synchronously, rather than relying on server markup", () => {
    // The server no longer renders aria-busy -- prove the script sets it as
    // its first action, before the (held-open) fetch has a chance to resolve.
    const noBusyHtml = WIDGET_HTML.replace(' aria-busy="true"', "");
    const dom = new JSDOM(noBusyHtml, { runScripts: "dangerously" });
    let resolveFetch;
    dom.window.fetch = () => new Promise((resolve) => { resolveFetch = resolve; });

    const el = dom.window.document.createElement("script");
    el.textContent = script;
    dom.window.document.body.appendChild(el);

    assert.strictEqual(
      dom.window.document.querySelector("[data-burn-status]").getAttribute("aria-busy"),
      "true"
    );

    resolveFetch({ ok: true, status: 200, json: () => Promise.resolve(fixture) });
    return dom.window.__burnStatusReady;
  });
});

/** Deep-clones the fixture and applies `mutate` before returning it. */
function withPayload(mutate) {
  const payload = JSON.parse(JSON.stringify(fixture));
  mutate(payload);
  return payload;
}

describe("Value normalisation", () => {
  const FIRE_DANGER = [
    ["low", "Low", "level--low"],
    ["moderate", "Moderate", "level--moderate"],
    ["high", "High", "level--high"],
    ["very_high", "Very High", "level--very-high"],
    ["extreme", "Extreme", "level--extreme"],
  ];

  for (const [token, text, className] of FIRE_DANGER) {
    it(`renders fireDanger "${token}" as "${text}"`, async () => {
      const doc = await boot(ok(withPayload((p) => { p.fireDanger = token; })));
      assert.strictEqual(cell(doc, "fire-danger").textContent.trim(), text);
      assert.ok(cell(doc, "fire-danger").className.includes(className));
    });
  }

  const STATES = [
    ["open", "Open", "level--open"],
    ["closed", "Closed", "level--closed"],
    ["restricted", "Restricted", "level--restricted"],
  ];

  for (const [token, text, className] of STATES) {
    it(`renders state "${token}" as "${text}" on a permit row`, async () => {
      // restricted on a *permit* row is the case the old Tina schema could not
      // express -- permits were Open/Closed only.
      const doc = await boot(ok(withPayload((p) => {
        p.statuses.find((s) => s.slug === "residential").state = token;
      })));
      assert.strictEqual(cell(doc, "residential").textContent.trim(), text);
      assert.ok(cell(doc, "residential").className.includes(className));
    });
  }

  for (const separator of ["very high", "very-high"]) {
    it(`accepts "${separator}" as equivalent to very_high`, async () => {
      const doc = await boot(ok(withPayload((p) => { p.fireDanger = separator; })));
      assert.strictEqual(cell(doc, "fire-danger").textContent.trim(), "Very High");
      assert.ok(cell(doc, "fire-danger").className.includes("level--very-high"));
    });
  }

  it("does not title-case airQuality.category", async () => {
    const doc = await boot(ok(withPayload((p) => {
      p.airQuality.category = "Unhealthy for Sensitive Groups";
      p.airQuality.pm25Aqi = 130;
    })));
    // EPA's own capitalisation -- "for" stays lowercase.
    assert.strictEqual(
      doc.querySelector("[data-aqi-label]").textContent,
      "AQI · Unhealthy for Sensitive Groups"
    );
    assert.ok(
      cell(doc, "air-quality").className
        .includes("level--aqi-unhealthy-for-sensitive-groups")
    );
  });
});

const warning = (doc) => doc.querySelector(".widget__warning");

describe("Failure handling", () => {
  const FAILURES = [
    ["a network rejection", () => Promise.reject(new Error("offline"))],
    ["HTTP 500", () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })],
    ["malformed JSON", () => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError("bad")) })],
    ["a payload with no statuses array", ok({ season: { start: "2026-10-06", end: "2027-06-05" } })],
    ["a payload with an empty statuses array", ok({ statuses: [] })],
    ["a payload where none of the five expected slugs match (wholesale slug rename)",
      ok(withPayload((p) => {
        p.statuses.forEach((s) => { s.slug = "renamed-" + s.slug; });
      }))],
  ];

  for (const [label, responder] of FAILURES) {
    it(`shows the warning on ${label}`, async () => {
      const doc = await boot(responder);
      const cellEl = warning(doc);
      assert.ok(cellEl, "expected a warning cell");
      assert.match(cellEl.textContent, /Live fire status unavailable/);
      assert.strictEqual(
        cellEl.querySelector('a[href="tel:+13603785334"]').textContent,
        "(360) 378-5334"
      );
      assert.ok(cellEl.querySelector('a[href="/services/burn-permits/"]'));
    });

    it(`leaves no half-patched rows on ${label}`, async () => {
      const doc = await boot(responder);
      // The whole tbody is replaced, so no status cells survive at all.
      assert.strictEqual(doc.querySelectorAll("[data-row]").length, 0);
      assert.strictEqual(doc.querySelector("[data-burn-season]").hidden, true);
      assert.strictEqual(
        doc.querySelector("[data-burn-status]").hasAttribute("aria-busy"),
        false
      );
    });
  }
});

describe("Partial data", () => {
  it("shows an em dash for a slug missing from statuses[] and still patches the rest", async () => {
    const doc = await boot(ok(withPayload((p) => {
      p.statuses = p.statuses.filter((s) => s.slug !== "commercial");
    })));
    assert.strictEqual(cell(doc, "commercial").textContent.trim(), "—");
    assert.ok(cell(doc, "commercial").className.includes("level--unknown"));
    // Neighbouring rows are unaffected.
    assert.strictEqual(cell(doc, "residential").textContent.trim(), "Closed");
    assert.ok(!warning(doc), "a missing slug must not trigger the warning");
  });

  it("still patches per-row (no warning) when only one of the five expected slugs matches", async () => {
    // The boundary case just short of a total slug rename (M3): as long as
    // at least one expected slug is present, this is partial data, not an
    // unusable payload -- each unmatched row degrades to an em dash on its
    // own, and the rest of the table still renders.
    const doc = await boot(ok(withPayload((p) => {
      p.statuses.forEach((s) => {
        if (s.slug !== "residential") s.slug = "renamed-" + s.slug;
      });
    })));
    assert.strictEqual(cell(doc, "residential").textContent.trim(), "Closed");
    assert.strictEqual(cell(doc, "commercial").textContent.trim(), "—");
    assert.strictEqual(cell(doc, "recreational-county").textContent.trim(), "—");
    assert.strictEqual(cell(doc, "recreational-dnr").textContent.trim(), "—");
    assert.strictEqual(cell(doc, "recreational-nps").textContent.trim(), "—");
    assert.ok(!warning(doc), "at least one matching slug must not trigger the warning");
  });

  it("shows an em dash when fireDanger is absent", async () => {
    const doc = await boot(ok(withPayload((p) => { delete p.fireDanger; })));
    assert.strictEqual(cell(doc, "fire-danger").textContent.trim(), "—");
    assert.ok(cell(doc, "fire-danger").className.includes("level--unknown"));
    assert.ok(!warning(doc), "an absent fireDanger must not trigger the warning");
  });

  it("renders an unrecognised state uncoloured rather than mis-coloured", async () => {
    const doc = await boot(ok(withPayload((p) => {
      p.statuses.find((s) => s.slug === "residential").state = "partial";
    })));
    const target = cell(doc, "residential");
    assert.strictEqual(target.textContent.trim(), "Partial");
    assert.strictEqual(target.className, "level");
    assert.ok(!warning(doc), "an unrecognised state must not trigger the warning");
  });

  const NO_AQI = [
    ["airQuality is null", (p) => { p.airQuality = null; }],
    ["airQuality is absent", (p) => { delete p.airQuality; }],
    ["pm25Aqi is negative", (p) => { p.airQuality.pm25Aqi = -1; }],
    ["pm25Aqi is not a number", (p) => { p.airQuality.pm25Aqi = "17"; }],
  ];

  for (const [label, mutate] of NO_AQI) {
    it(`hides the air quality row when ${label}`, async () => {
      const doc = await boot(ok(withPayload(mutate)));
      assert.strictEqual(doc.querySelector("[data-aqi-row]").hidden, true);
      assert.ok(!warning(doc), "a missing AQI must not trigger the warning");
    });
  }

  it("hides the season line when season is absent", async () => {
    const doc = await boot(ok(withPayload((p) => { delete p.season; })));
    assert.strictEqual(doc.querySelector("[data-burn-season]").hidden, true);
    // Everything else still patches.
    assert.strictEqual(cell(doc, "residential").textContent.trim(), "Closed");
    assert.ok(!warning(doc), "an absent season must not trigger the warning");
  });
});

describe("Air quality link safety", () => {
  it("rejects a javascript: URL rather than writing it into the href", async () => {
    const doc = await boot(ok(withPayload((p) => {
      p.airQuality.linkUrl = "javascript:alert(document.cookie)";
    })));
    const link = doc.querySelector("[data-aqi-link]");
    assert.strictEqual(link.getAttribute("href"), null);
    // The row still renders -- only the link is refused.
    assert.strictEqual(doc.querySelector("[data-aqi-row]").hidden, false);
  });

  it("treats an unparseable URL (throws in the URL constructor) as no link", async () => {
    const doc = await boot(ok(withPayload((p) => {
      // A malformed host (embedded space) -- new URL() throws for this
      // regardless of base, exercising the safeHttpUrl catch branch.
      p.airQuality.linkUrl = "http://exa mple.com";
    })));
    const link = doc.querySelector("[data-aqi-link]");
    assert.strictEqual(link.getAttribute("href"), null);
    // The row still renders -- a bad link degrades to plain text, not a warning.
    assert.strictEqual(doc.querySelector("[data-aqi-row]").hidden, false);
    assert.ok(!warning(doc), "a malformed AQI link must not trigger the warning");
  });

  it("accepts an http: URL, not just https:", async () => {
    const doc = await boot(ok(withPayload((p) => {
      p.airQuality.linkUrl = "http://example.com/aqi";
    })));
    assert.strictEqual(
      doc.querySelector("[data-aqi-link]").getAttribute("href"),
      "http://example.com/aqi"
    );
  });

  it("removes the href (rather than leaving href=\"#\") when linkUrl is null", async () => {
    const doc = await boot(ok(withPayload((p) => {
      p.airQuality.linkUrl = null;
    })));
    const link = doc.querySelector("[data-aqi-link]");
    assert.strictEqual(link.getAttribute("href"), null);
    // The row is still shown and filled in -- only the link is absent.
    assert.strictEqual(doc.querySelector("[data-aqi-row]").hidden, false);
    assert.strictEqual(doc.querySelector("[data-aqi-score]").textContent, "17");
  });
});

/**
 * Boots the widget with a pre-started request already on window, the way
 * base.liquid's inline head script provides it. `fetch` is stubbed to throw so
 * any test in this block that falls back to fetching fails loudly.
 */
async function bootWithEarlyFetch(payloadPromise) {
  const dom = new JSDOM(WIDGET_HTML, { runScripts: "dangerously" });
  let fetchCalls = 0;
  dom.window.fetch = () => {
    fetchCalls += 1;
    return Promise.reject(new Error("burn-status.js must not re-fetch"));
  };
  dom.window.__burnStatusFetch = payloadPromise;
  const el = dom.window.document.createElement("script");
  el.textContent = script;
  dom.window.document.body.appendChild(el);
  await dom.window.__burnStatusReady;
  return { doc: dom.window.document, fetchCalls: () => fetchCalls };
}

describe("Head-started request", () => {
  it("uses the in-flight promise and does not fetch again", async () => {
    const { doc, fetchCalls } = await bootWithEarlyFetch(Promise.resolve(fixture));

    assert.strictEqual(fetchCalls(), 0, "should reuse the head-started request");
    assert.strictEqual(cell(doc, "fire-danger").textContent.trim(), "High");
    assert.strictEqual(cell(doc, "residential").textContent.trim(), "Closed");
    assert.strictEqual(
      doc.querySelector("[data-burn-status]").hasAttribute("aria-busy"),
      false
    );
  });

  it("shows the warning when the head-started request rejects", async () => {
    const { doc } = await bootWithEarlyFetch(Promise.reject(new Error("HTTP 500")));

    const cellEl = doc.querySelector(".widget__warning");
    assert.ok(cellEl, "expected a warning cell");
    assert.match(cellEl.textContent, /Live fire status unavailable/);
    assert.strictEqual(doc.querySelectorAll("[data-row]").length, 0);
  });

  it("shows the warning when the head-started request yields an unusable payload", async () => {
    const { doc } = await bootWithEarlyFetch(Promise.resolve({ statuses: [] }));

    assert.ok(doc.querySelector(".widget__warning"));
  });

  it("still fetches for itself when no head-started request exists", async () => {
    // The fallback path -- e.g. a page whose head snippet did not render.
    const doc = await boot(ok(fixture));
    assert.strictEqual(cell(doc, "fire-danger").textContent.trim(), "High");
  });
});
