# Runtime Burn Status from the StationWorks API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the Fire Safety widget entirely from a live client-side fetch of the StationWorks permits API, replacing two committed data files, and stop the hourly AirNow workflow that redeploys the site ~13× a day.

**Architecture:** Eleventy renders the widget's structure only — row labels, placeholder cells, `aria-busy="true"`. A plain browser IIFE at `src/js/burn-status.js` fetches `https://permits.stationworks.app/v1/agencies/sjifire/status` on every page load, maps the payload to a view model, and patches every cell in one pass. Any failure replaces the table body with a warning. There is no static fallback and no `localStorage` — the response's `cache-control: max-age=120` does the throttling.

**Tech Stack:** Eleventy 3 + LiquidJS · vanilla browser JS (no build step, no modules) · `node --test` + jsdom 28 for unit tests · Playwright 1.57 for e2e · Azure Static Web Apps CSP.

**Spec:** `docs/superpowers/specs/2026-08-09-burn-status-from-api-design.md`

## Global Constraints

- **Worktree:** `.claude/worktrees/burn-status-from-api`, branch `feat/burn-status-from-api`. All paths below are relative to it.
- **`src/js/burn-status.js` is a plain browser IIFE.** No ESM, no bundler, no dependencies. 2-space indent, `'use strict'`, early-return guard — match `src/js/carousel.js`.
- **Unit tests are CommonJS** (`require`). `package.json` has no `"type"` field, so `.js` is CJS. Match `tests/carousel.test.js`.
- **Endpoint:** `https://permits.stationworks.app/v1/agencies/sjifire/status`
- **`fireDanger` enum (confirmed):** `low`, `moderate`, `high`, `very_high`, `extreme`
- **`state` enum (confirmed):** `open`, `closed`, `restricted` — valid on **every** status row including permits.
- **Status slugs consumed:** `residential`, `commercial`, `recreational-county`, `recreational-dnr`, `recreational-nps`
- **Two transforms, never confused:** `slugify` (→ CSS class suffix) and `titleCase` (→ display text). Both split on whitespace, underscore, and hyphen.
- **`airQuality.category` is NEVER title-cased.** It arrives display-ready. Title-casing would turn EPA's `"Unhealthy for Sensitive Groups"` into `"Unhealthy For Sensitive Groups"`.
- **Office phone:** `(360) 378-5334`, linked as `tel:(360) 378-5334` (matches `src/_includes/footer.liquid:47`).
- **Burn permits page:** `/services/burn-permits/`
- **No new `level--*` colors.** All eight already exist at `src/css/site.css:1296-1349`.
- **`src/js/` is not in the `lint:js` glob.** Do not add it — out of scope.
- Run `npm run lint` and `npm run test:unit` before every commit.

## Already on the branch

The TinaCMS deprecation notice (spec § `tina/config.ts`) was committed in `69319a0`. Do not redo it. Verify with `git show 69319a0 -- tina/config.ts` if unsure.

## File Structure

| File | Responsibility |
|---|---|
| `src/_includes/burn-status-widget.liquid` | **Modify.** Static structure + hooks only. No data references. |
| `src/js/burn-status.js` | **Create.** Fetch, map, patch, fail. The only file with behavior. |
| `src/css/site.css` | **Modify.** Two additions: `.level--unknown`, `.widget__warning`. |
| `src/_includes/page.liquid:20` | **Modify.** Drop unused render args. |
| `src/pages/homepage.liquid:110` | **Modify.** Drop unused render args. |
| `staticwebapp.config.json:136` | **Modify.** One host onto `connect-src`. |
| `.github/workflows/update-air-quality.yml` | **Modify.** Remove `schedule:`. |
| `CLAUDE.md` | **Modify.** Document the new data flow. |
| `tests/burn-status.test.js` | **Create.** jsdom unit tests. |
| `tests/fixtures/agency-status.json` | **Create.** Captured live response. |
| `tests/burn-status.spec.js` | **Create.** Playwright e2e, route-mocked. |

**Untouched:** `src/_data/burn_status.json`, `src/_data/air_quality.json`, `scripts/generate-air-quality.mjs`.

## The DOM contract

Task 1 creates this markup; Task 2 onward patches it. **The selectors are the interface between them — do not rename without updating both.**

| Selector | Purpose |
|---|---|
| `[data-burn-status]` | The `<table>`. Script's mount point and early-return guard. |
| `[data-burn-body]` | The `<tbody>`. Replaced wholesale on failure. |
| `[data-burn-season]` | Header season line. Starts `hidden`. |
| `[data-season-range]` | `<span>` inside it holding `Oct 6-Jun 5`. |
| `[data-row="fire-danger"]` | Fire danger `<td>`. |
| `[data-row="residential"]` etc. | One per status slug — the attribute value **is** the API slug. |
| `[data-aqi-row]` | Air-quality `<tr>`. Starts `hidden`. |
| `[data-row="air-quality"]` | Air-quality `<td>` (carries the `level--aqi-*` class). |
| `[data-aqi-link]` / `[data-aqi-score]` / `[data-aqi-label]` / `[data-aqi-source]` | Inner nodes. |

---

### Task 1: Server-rendered skeleton, CSS, and CSP

**Files:**
- Modify: `src/_includes/burn-status-widget.liquid` (full rewrite, 84 lines → skeleton)
- Modify: `src/css/site.css` (append after line 1349, before `.widget__body .level a`)
- Modify: `src/_includes/page.liquid:20`
- Modify: `src/pages/homepage.liquid:110`
- Modify: `staticwebapp.config.json:136`

**Interfaces:**
- Consumes: nothing.
- Produces: the DOM contract above, consumed by every later task.

- [ ] **Step 1: Replace the widget template**

Overwrite `src/_includes/burn-status-widget.liquid` entirely:

```liquid
<table class="widget widget--burn-status" data-burn-status aria-busy="true">
  <caption class="widget__header">
    <div class="flex">
      <svg aria-hidden="true"><use xlink:href='#flame' /></svg>
      <div>
        <span class="widget__title">Fire Safety</span>
        <div class="timeframe" data-burn-season hidden>
          Burn Season: <span data-season-range></span>
        </div>
      </div>
    </div>
  </caption>
  <tbody class="widget__body" data-burn-body>
    <tr>
      <th>
        Fire Danger
      </th>
      <td class="level level--unknown" data-row="fire-danger">&mdash;</td>
    </tr>
    <tr data-aqi-row hidden>
      <th>
        Air Quality &amp; Smoke
        <aside data-aqi-source></aside>
      </th>
      <td class="level" data-row="air-quality">
        <a href="#" target="_blank" rel="noopener" data-aqi-link>
          <span class="level__score" data-aqi-score></span>
          <span class="level__label" data-aqi-label></span>
        </a>
      </td>
    </tr>
    <tr>
      <th>
        Residential Burn Permits
      </th>
      <td class="level level--unknown" data-row="residential">&mdash;</td>
    </tr>
    <tr>
      <th>
        Commercial Burn Permits
      </th>
      <td class="level level--unknown" data-row="commercial">&mdash;</td>
    </tr>
    <tr>
      <th>
        Recreational Fires: San Juan County
      </th>
      <td class="level level--unknown" data-row="recreational-county">&mdash;</td>
    </tr>
    <tr>
      <th>
        Recreational Fires: State Park & DNR
      </th>
      <td class="level level--unknown" data-row="recreational-dnr">&mdash;</td>
    </tr>
    <tr>
      <th>
        Recreational Fires: National Parks
      </th>
      <td class="level level--unknown" data-row="recreational-nps">&mdash;</td>
    </tr>
  </tbody>
  {% if page.url == '/' %}
    <tfoot class="widget__foot">
      <td colspan="2">
        <a href="/services/burn-permits/">More Info »</a>
      </td>
    </tfoot>
  {% endif %}
</table>
<script defer src="/js/burn-status.js"></script>
```

Note: no `{{ burn_status.* }}` or `{{ air_quality.* }}` references remain anywhere in the file.

- [ ] **Step 2: Add the two CSS rules**

In `src/css/site.css`, immediately after the `.widget__body .level--aqi-hazardous` block (ends line 1349) and before `.widget__body .level a`:

```css
/* Placeholder shown before the live fetch resolves */
.widget__body .level--unknown {
  background-color: #f0f0f0;
  color: #6b6b6b;
  font-weight: 400;
}

/* Shown when the live status API is unreachable */
.widget__body .widget__warning {
  padding: 15px 5px;
  font-size: 0.9em;
  line-height: 1.4;
  color: #6b6b6b;
}

.widget__body .widget__warning a {
  color: inherit;
  text-decoration: underline;
}
```

- [ ] **Step 3: Drop the unused render arguments**

`src/_includes/page.liquid:20` — change:

```liquid
          {% render "burn-status-widget.liquid", burn_status: burn_status, air_quality: air_quality, page: page %}
```

to:

```liquid
          {% render "burn-status-widget.liquid", page: page %}
```

`src/pages/homepage.liquid:110` — change:

```liquid
      {% render "burn-status-widget.liquid", burn_status: burn_status, air_quality: air_quality, page: page %}
```

to:

```liquid
      {% render "burn-status-widget.liquid", page: page %}
```

- [ ] **Step 4: Widen the CSP by one host**

In `staticwebapp.config.json:136`, inside the `Content-Security-Policy` value, change:

```
connect-src 'self' https://res.cloudinary.com https://api.cloudinary.com https://content.cloudinary.com;
```

to:

```
connect-src 'self' https://res.cloudinary.com https://api.cloudinary.com https://content.cloudinary.com https://permits.stationworks.app;
```

Change nothing else in that header.

- [ ] **Step 5: Verify the build and the rendered markup**

Run:

```bash
npm run build
grep -c 'data-burn-status' _site/index.html
grep -c 'burn_status' _site/index.html
```

Expected: first `grep` prints `1`; second prints `0` (no leftover template data). The build must exit 0.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: exits 0. (`lint:css` covers `src/css/**/*.css`.)

- [ ] **Step 7: Commit**

```bash
git add src/_includes/burn-status-widget.liquid src/css/site.css \
        src/_includes/page.liquid src/pages/homepage.liquid staticwebapp.config.json
git commit -m "feat: render Fire Safety widget as a static skeleton

Strips all burn_status and air_quality data references from the widget,
leaving row labels, placeholder cells and stable data-* hooks for the
client-side script to patch. Adds .level--unknown and .widget__warning
styles, and allows permits.stationworks.app in connect-src.

The widget shows placeholders until the next task adds the fetch."
```

---

### Task 2: Fetch and patch the happy path

**Files:**
- Create: `src/js/burn-status.js`
- Create: `tests/fixtures/agency-status.json`
- Create: `tests/burn-status.test.js`

**Interfaces:**
- Consumes: the DOM contract from Task 1.
- Produces:
  - `window.__burnStatusReady` — a `Promise` that settles after the widget has been patched or the warning rendered. **Tests await this**; without it they race the fetch. It is the script's only global.
  - Internal helpers `slugify(value) -> string`, `titleCase(value) -> string`, `buildView(payload) -> object|null`, `render(view) -> void`, `renderWarning() -> void`. Not exported; tested through the DOM.

- [ ] **Step 1: Save the fixture**

Create `tests/fixtures/agency-status.json` — the live response captured 2026-08-09:

```json
{
  "agency": { "slug": "sjifire", "displayName": "San Juan Island Fire & Rescue" },
  "season": { "start": "2026-10-06", "end": "2027-06-05" },
  "fireDanger": "high",
  "statuses": [
    { "slug": "residential", "label": "Residential Burn Permits", "state": "closed", "permitTypeSlug": "residential", "linkUrl": null, "section": null },
    { "slug": "commercial", "label": "Commercial Burn Permits", "state": "closed", "permitTypeSlug": "commercial", "linkUrl": null, "section": null },
    { "slug": "recreational-county", "label": "County lands", "state": "open", "permitTypeSlug": null, "linkUrl": null, "section": "recreational-fires" },
    { "slug": "recreational-dnr", "label": "State Park & DNR lands", "state": "closed", "permitTypeSlug": null, "linkUrl": null, "section": "recreational-fires" },
    { "slug": "recreational-nps", "label": "National Park lands", "state": "closed", "permitTypeSlug": null, "linkUrl": null, "section": "recreational-fires" }
  ],
  "airQuality": {
    "station": "Anacortes",
    "pm25Aqi": 17,
    "category": "Good",
    "categoryNumber": 1,
    "observedAt": "2026-08-09T17:00:00.000Z",
    "linkUrl": "https://www.airnow.gov/?reportingArea=Anacortes&stateCode=WA"
  },
  "asOf": "2026-08-09T17:35:39.339Z"
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/burn-status.test.js`:

```js
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tests/burn-status.test.js`
Expected: FAIL — `ENOENT ... src/js/burn-status.js`, because the script does not exist yet.

- [ ] **Step 4: Write the implementation**

Create `src/js/burn-status.js`:

```js
// Fire Safety widget -- live burn status from the StationWorks permits API.
// The server renders structure only; everything below fills it in.
(function () {
  'use strict';

  const table = document.querySelector('[data-burn-status]');
  if (!table) return;

  const ENDPOINT = 'https://permits.stationworks.app/v1/agencies/sjifire/status';
  const TIMEOUT_MS = 8000;

  // The data-row attribute for these rows IS the API's status slug.
  const STATUS_SLUGS = [
    'residential',
    'commercial',
    'recreational-county',
    'recreational-dnr',
    'recreational-nps'
  ];

  // Tokens we have a colour for. Anything else renders uncoloured rather than
  // mis-coloured -- a wrong colour on a fire danger row is worse than none.
  const KNOWN_LEVELS = [
    'low', 'moderate', 'high', 'very-high', 'extreme',
    'open', 'closed', 'restricted'
  ];

  const SEASON_FMT = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });

  // "very_high" -> "very-high" (CSS class suffix)
  function slugify(value) {
    return String(value).trim().toLowerCase().replace(/[\s_-]+/g, '-');
  }

  // "very_high" -> "Very High" (display text)
  function titleCase(value) {
    return String(value)
      .trim()
      .toLowerCase()
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map(function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }

  function formatSeasonDate(value) {
    if (typeof value !== 'string') return null;
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!match) return null;
    // Force UTC -- naive parsing renders 2026-10-06 as Oct 5 in Pacific time.
    const date = new Date(match[1] + 'T00:00:00Z');
    return isNaN(date.getTime()) ? null : SEASON_FMT.format(date);
  }

  function cellFor(token) {
    if (typeof token !== 'string' || !token.trim()) {
      return { text: '—', className: 'level level--unknown' };
    }
    const slug = slugify(token);
    return {
      text: titleCase(token),
      className: KNOWN_LEVELS.indexOf(slug) === -1
        ? 'level'
        : 'level level--' + slug
    };
  }

  function seasonFor(season) {
    if (!season) return null;
    const start = formatSeasonDate(season.start);
    const end = formatSeasonDate(season.end);
    return start && end ? start + '-' + end : null;
  }

  function airQualityFor(aq) {
    if (!aq) return null;
    const aqi = aq.pm25Aqi;
    if (typeof aqi !== 'number' || !isFinite(aqi) || aqi < 0) return null;
    // category arrives display-ready ("Unhealthy for Sensitive Groups").
    // Slugify it for the class, but never title-case it for display.
    const category = typeof aq.category === 'string' ? aq.category : '';
    return {
      score: String(Math.round(aqi)),
      label: category ? 'AQI · ' + category : 'AQI',
      className: category ? 'level level--aqi-' + slugify(category) : 'level',
      station: typeof aq.station === 'string' ? aq.station : '',
      href: typeof aq.linkUrl === 'string' && aq.linkUrl ? aq.linkUrl : null
    };
  }

  // Map the whole payload up front. Returning null means "show the warning" --
  // we never patch a partial view.
  function buildView(payload) {
    if (!payload || !Array.isArray(payload.statuses) || !payload.statuses.length) {
      return null;
    }

    const bySlug = Object.create(null);
    payload.statuses.forEach(function (status) {
      if (status && typeof status.slug === 'string') bySlug[status.slug] = status;
    });

    const rows = { 'fire-danger': cellFor(payload.fireDanger) };
    STATUS_SLUGS.forEach(function (slug) {
      rows[slug] = cellFor(bySlug[slug] && bySlug[slug].state);
    });

    return {
      rows: rows,
      season: seasonFor(payload.season),
      airQuality: airQualityFor(payload.airQuality)
    };
  }

  function renderAirQuality(aq) {
    const row = table.querySelector('[data-aqi-row]');
    if (!row) return;
    if (!aq) {
      row.hidden = true;
      return;
    }

    const cell = table.querySelector('[data-row="air-quality"]');
    if (cell) cell.className = aq.className;

    const score = table.querySelector('[data-aqi-score]');
    if (score) score.textContent = aq.score;

    const label = table.querySelector('[data-aqi-label]');
    if (label) label.textContent = aq.label;

    const link = table.querySelector('[data-aqi-link]');
    if (link && aq.href) link.setAttribute('href', aq.href);

    const source = table.querySelector('[data-aqi-source]');
    if (source) {
      source.textContent = '';
      if (aq.station) {
        source.appendChild(
          document.createTextNode('Nearest monitor: ' + aq.station + ' ')
        );
        const nowrap = document.createElement('span');
        nowrap.className = 'widget__nowrap';
        nowrap.textContent = '· PM2.5';
        source.appendChild(nowrap);
      }
    }

    row.hidden = false;
  }

  function render(view) {
    Object.keys(view.rows).forEach(function (key) {
      const cell = table.querySelector('[data-row="' + key + '"]');
      if (!cell) return;
      cell.textContent = view.rows[key].text;
      cell.className = view.rows[key].className;
    });

    const season = table.querySelector('[data-burn-season]');
    const range = table.querySelector('[data-season-range]');
    if (season && range) {
      if (view.season) {
        range.textContent = view.season;
        season.hidden = false;
      } else {
        season.hidden = true;
      }
    }

    renderAirQuality(view.airQuality);
    table.removeAttribute('aria-busy');
  }

  function renderWarning() {
    const body = table.querySelector('[data-burn-body]');
    if (body) {
      while (body.firstChild) body.removeChild(body.firstChild);

      const cell = document.createElement('td');
      cell.colSpan = 2;
      cell.className = 'widget__warning';
      cell.appendChild(
        document.createTextNode('⚠ Live fire status unavailable. Call ')
      );

      const phone = document.createElement('a');
      phone.setAttribute('href', 'tel:(360) 378-5334');
      phone.textContent = '(360) 378-5334';
      cell.appendChild(phone);

      cell.appendChild(document.createTextNode(' or see '));

      const permits = document.createElement('a');
      permits.setAttribute('href', '/services/burn-permits/');
      permits.textContent = 'Burn Permits ›';
      cell.appendChild(permits);

      const row = document.createElement('tr');
      row.appendChild(cell);
      body.appendChild(row);
    }

    // A season range is a status claim; don't show one next to "unavailable".
    const season = table.querySelector('[data-burn-season]');
    if (season) season.hidden = true;

    // Not busy any more -- we're done, we just failed.
    table.removeAttribute('aria-busy');
  }

  function load() {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);

    return fetch(ENDPOINT, { signal: controller.signal })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (payload) {
        const view = buildView(payload);
        if (!view) throw new Error('unusable payload');
        render(view);
      })
      .catch(function () {
        renderWarning();
      })
      .then(function () {
        clearTimeout(timer);
      });
  }

  // Exposed so tests can await the patch deterministically instead of sleeping.
  window.__burnStatusReady = load();
})();
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/burn-status.test.js`
Expected: PASS, 4/4.

- [ ] **Step 6: Run the whole unit suite**

Run: `npm run test:unit`
Expected: PASS. Nothing else should regress.

- [ ] **Step 7: Commit**

```bash
git add src/js/burn-status.js tests/burn-status.test.js tests/fixtures/agency-status.json
git commit -m "feat: fetch live burn status and patch the Fire Safety widget

Adds src/js/burn-status.js: fetches the StationWorks agency status endpoint
on page load, maps the whole payload to a view model before touching the DOM,
then patches every row in one pass.

Season dates are formatted in UTC -- naive parsing of the date-only strings
renders 2026-10-06 as Oct 5 in Pacific time."
```

---

### Task 3: Value normalisation across the confirmed enums

**Files:**
- Modify: `tests/burn-status.test.js` (append a describe block)
- Modify: `src/js/burn-status.js` only if a case fails

**Interfaces:**
- Consumes: `boot`, `ok`, `cell`, `fixture` from Task 2's test file.
- Produces: nothing new. This task pins behavior Task 2 already implements.

**These are characterisation tests, not red-green TDD.** Task 2 built the transforms; this task
locks the full confirmed enums against regression. Expect them to pass on the first run. If one
fails, Task 2 has a real bug — fix `src/js/burn-status.js`, never the assertion.

- [ ] **Step 1: Write the tests**

Append to `tests/burn-status.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests**

Run: `node --test tests/burn-status.test.js`
Expected: PASS, all cases. Task 2's implementation already satisfies them — this task exists to prove it and to lock the enums against regression.

If any case fails, fix `slugify`, `titleCase`, `KNOWN_LEVELS`, or `airQualityFor` in `src/js/burn-status.js` — **do not** relax the test.

- [ ] **Step 3: Commit**

```bash
git add tests/burn-status.test.js
git commit -m "test: pin fireDanger and state enums to display text and CSS class

Table-driven across all eight confirmed tokens. Covers very_high -> Very High
/ level--very-high, separator tolerance, and restricted on a permit row --
a state the old TinaCMS schema could not represent.

Also pins that airQuality.category is not title-cased: EPA's label is
'Unhealthy for Sensitive Groups', not 'Unhealthy For Sensitive Groups'."
```

---

### Task 4: Failure and partial-data handling

**Files:**
- Modify: `tests/burn-status.test.js` (append a describe block)
- Modify: `src/js/burn-status.js` only if a case fails

**Interfaces:**
- Consumes: `boot`, `ok`, `cell`, `fixture`, `withPayload` from Tasks 2–3.
- Produces: nothing new.

**Characterisation tests, as in Task 3.** Task 2 implemented these paths; expect them to pass on the
first run. A failure means a real bug in `src/js/burn-status.js` — fix the implementation, never the
assertion.

- [ ] **Step 1: Write the tests**

Append to `tests/burn-status.test.js`:

```js
const warning = (doc) => doc.querySelector(".widget__warning");

describe("Failure handling", () => {
  const FAILURES = [
    ["a network rejection", () => Promise.reject(new Error("offline"))],
    ["HTTP 500", () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })],
    ["malformed JSON", () => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError("bad")) })],
    ["a payload with no statuses array", ok({ season: { start: "2026-10-06", end: "2027-06-05" } })],
    ["a payload with an empty statuses array", ok({ statuses: [] })],
  ];

  for (const [label, responder] of FAILURES) {
    it(`shows the warning on ${label}`, async () => {
      const doc = await boot(responder);
      const cellEl = warning(doc);
      assert.ok(cellEl, "expected a warning cell");
      assert.match(cellEl.textContent, /Live fire status unavailable/);
      assert.strictEqual(
        cellEl.querySelector('a[href="tel:(360) 378-5334"]').textContent,
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

  it("shows an em dash when fireDanger is absent", async () => {
    const doc = await boot(ok(withPayload((p) => { delete p.fireDanger; })));
    assert.strictEqual(cell(doc, "fire-danger").textContent.trim(), "—");
    assert.ok(cell(doc, "fire-danger").className.includes("level--unknown"));
  });

  it("renders an unrecognised state uncoloured rather than mis-coloured", async () => {
    const doc = await boot(ok(withPayload((p) => {
      p.statuses.find((s) => s.slug === "residential").state = "partial";
    })));
    const target = cell(doc, "residential");
    assert.strictEqual(target.textContent.trim(), "Partial");
    assert.strictEqual(target.className, "level");
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
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `node --test tests/burn-status.test.js`
Expected: PASS. Task 2's implementation already covers these paths; fix the implementation, not the test, if any fail.

- [ ] **Step 3: Run the whole unit suite and lint**

Run: `npm run test:unit && npm run lint`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add tests/burn-status.test.js
git commit -m "test: cover failure paths and partial payloads

Network rejection, HTTP 500, malformed JSON, and missing/empty statuses all
produce the warning with a working phone link, clear aria-busy, hide the
season line, and leave no half-patched rows.

Partial data degrades per-row instead: a missing slug or fireDanger shows an
em dash, an unrecognised state renders uncoloured rather than mis-coloured,
and a missing airQuality hides just that row."
```

---

### Task 5: Retire the hourly workflow and document the new flow

**Files:**
- Modify: `.github/workflows/update-air-quality.yml:3-9`
- Modify: `CLAUDE.md` (the "Air Quality (AirNow)" section)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Remove the schedule trigger**

In `.github/workflows/update-air-quality.yml`, replace lines 3–9:

```yaml
on:
  schedule:
    # Hourly (AirNow updates hourly). The fetch script only rewrites the data
    # file — and thus redeploys the site — when the AQI moves >=5% or its
    # category changes, so routine hourly runs are no-ops.
    - cron: '0 * * * *'
  workflow_dispatch:
```

with:

```yaml
on:
  # No schedule. The Fire Safety widget reads air quality live from the
  # StationWorks permits API at runtime, so nothing here needs to run on a
  # timer. Kept manually runnable: this still refreshes src/_data/air_quality.json,
  # which no longer feeds the site but is retained for now.
  workflow_dispatch:
```

Change nothing else in the file. `scripts/generate-air-quality.mjs` stays untouched.

- [ ] **Step 2: Verify the workflow still parses**

Run:

```bash
node -e "const y=require('fs').readFileSync('.github/workflows/update-air-quality.yml','utf8'); if(/^\s*schedule:/m.test(y)) throw new Error('schedule still present'); if(!/workflow_dispatch:/.test(y)) throw new Error('workflow_dispatch missing'); console.log('ok')"
```

Expected: prints `ok`.

- [ ] **Step 3: Update CLAUDE.md**

Replace the whole `### Air Quality (AirNow)` section with:

```markdown
### Fire Safety Widget (Burn Status + Air Quality)

The Fire Safety widget reads **live at runtime** from the StationWorks permits
API. Nothing about it is baked in at build time.

**Endpoint:** `https://permits.stationworks.app/v1/agencies/sjifire/status`
(CORS-open, no API key, `cache-control: max-age=120`)

One response supplies the whole widget: burn season, fire danger, all five
permit/recreational statuses, and air quality.

**Files:**
- `src/_includes/burn-status-widget.liquid` - renders structure only (row labels,
  placeholder cells, `data-*` hooks). Contains no data references.
- `src/js/burn-status.js` - fetches on every page load and patches the cells.
  Maps the entire payload before touching the DOM, so the widget is never
  half-patched.

**There is no static fallback, deliberately.** If the API is unreachable the
widget shows "Live fire status unavailable" with the office phone number. A
stale committed baseline would instead show a confident wrong answer about
burn permits, which is worse than admitting we don't know.

**Enums** (confirmed with StationWorks):
- `fireDanger`: `low`, `moderate`, `high`, `very_high`, `extreme`
- `state`: `open`, `closed`, `restricted` - valid on **every** status row,
  including residential and commercial permits

Tokens are snake_case; the widget title-cases them for display (`very_high` ->
"Very High") and slugifies them for the CSS class (`level--very-high`). One
exception: `airQuality.category` arrives display-ready and is **never**
title-cased, or EPA's "Unhealthy for Sensitive Groups" would render as
"Unhealthy For Sensitive Groups".

#### Deprecated: TinaCMS "Burn Status" and the AirNow pipeline

`src/_data/burn_status.json` and `src/_data/air_quality.json` are **no longer read
by the site.** They remain on disk, and the TinaCMS collection is still present
but labelled `Burn Status (DEPRECATED — DO NOT EDIT)`.

**Editing burn status in TinaCMS has no effect on the public site and produces no
error.** Burn status is changed in the StationWorks permits system. Deleting the
collection and both JSON files is a pending follow-up.

`.github/workflows/update-air-quality.yml` and `scripts/generate-air-quality.mjs`
are retained and manually runnable (`workflow_dispatch`), but **no longer run on a
schedule**. The hourly cron produced 214 commits in 16 days -- roughly 13 site
redeploys a day -- to maintain a number the browser now fetches directly.

**Secrets** (only needed for a manual run):
- From GitHub Secrets: `AIRNOW_API_KEY`, `DEPLOY_KEY`

**Local Testing:**
```bash
export AIRNOW_API_KEY="your-api-key"
npm run air-quality
```
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/update-air-quality.yml CLAUDE.md
git commit -m "chore: stop the hourly AirNow schedule; document the runtime widget

The Fire Safety widget now reads live from the StationWorks permits API, so the
hourly cron no longer has a consumer. It produced 214 commits in 16 days -- about
13 redeploys a day. Workflow and script are kept manually runnable via
workflow_dispatch.

CLAUDE.md documents the new data flow, the confirmed enums, why there is no
static fallback, and that the TinaCMS Burn Status editor is now inert."
```

---

### Task 6: End-to-end verification in a real browser

**Files:**
- Create: `tests/burn-status.spec.js`

**Interfaces:**
- Consumes: the built site and `src/js/burn-status.js`.
- Produces: nothing.

- [ ] **Step 1: Write the e2e spec**

Create `tests/burn-status.spec.js`:

```js
import { test, expect } from "@playwright/test";

const ENDPOINT = "**/v1/agencies/sjifire/status";

const PAYLOAD = {
  agency: { slug: "sjifire", displayName: "San Juan Island Fire & Rescue" },
  season: { start: "2026-10-06", end: "2027-06-05" },
  fireDanger: "very_high",
  statuses: [
    { slug: "residential", label: "Residential Burn Permits", state: "restricted" },
    { slug: "commercial", label: "Commercial Burn Permits", state: "closed" },
    { slug: "recreational-county", label: "County lands", state: "open" },
    { slug: "recreational-dnr", label: "State Park & DNR lands", state: "closed" },
    { slug: "recreational-nps", label: "National Park lands", state: "closed" },
  ],
  airQuality: {
    station: "Anacortes",
    pm25Aqi: 17,
    category: "Good",
    linkUrl: "https://www.airnow.gov/?reportingArea=Anacortes&stateCode=WA",
  },
};

// The widget renders on the homepage and in the sidebar of interior pages.
const PAGES = [
  { path: "/", name: "homepage" },
  { path: "/services/burn-permits/", name: "sidebar page" },
];

test.describe("Fire Safety widget", () => {
  for (const target of PAGES) {
    test(`fills every row on the ${target.name}`, async ({ page }) => {
      await page.route(ENDPOINT, (route) =>
        route.fulfill({ json: PAYLOAD })
      );
      await page.goto(target.path);

      const widget = page.locator("[data-burn-status]");

      await expect(widget.locator('[data-row="fire-danger"]'))
        .toHaveText("Very High");
      await expect(widget.locator('[data-row="fire-danger"]'))
        .toHaveClass(/level--very-high/);
      await expect(widget.locator('[data-row="residential"]'))
        .toHaveText("Restricted");
      await expect(widget.locator('[data-row="residential"]'))
        .toHaveClass(/level--restricted/);
      await expect(widget.locator('[data-row="recreational-county"]'))
        .toHaveText("Open");
      await expect(widget.locator("[data-season-range]"))
        .toHaveText("Oct 6-Jun 5");
      await expect(widget.locator("[data-aqi-score]")).toHaveText("17");
      await expect(widget).not.toHaveAttribute("aria-busy", "true");

      // No placeholder survives a successful load.
      await expect(widget.locator(".level--unknown")).toHaveCount(0);
    });
  }

  const FAILURES = [
    ["a 500", (route) => route.fulfill({ status: 500, body: "nope" })],
    ["a garbage body", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "{{{" })],
    ["an aborted request", (route) => route.abort()],
  ];

  for (const [label, handler] of FAILURES) {
    test(`shows the warning on ${label}`, async ({ page }) => {
      await page.route(ENDPOINT, handler);
      await page.goto("/");

      const warning = page.locator(".widget__warning");
      await expect(warning).toBeVisible();
      await expect(warning).toContainText("Live fire status unavailable");
      await expect(warning.locator('a[href="tel:(360) 378-5334"]')).toBeVisible();
      await expect(page.locator("[data-burn-status]"))
        .not.toHaveAttribute("aria-busy", "true");
      // Never blank, never half-filled.
      await expect(page.locator("[data-row]")).toHaveCount(0);
    });
  }
});
```

- [ ] **Step 2: Run the e2e spec**

Run: `npx playwright test --config=tests/playwright.config.js burn-status.spec.js`
Expected: PASS, 5 tests. The config starts `npm run dev` on port 8080 automatically.

If Playwright browsers are not installed, run `npx playwright install chromium` first.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: unit and e2e both pass. `tests/smoke.spec.js` must stay green — it does not assert widget content, so it is unaffected whether the live API is reachable or not.

- [ ] **Step 4: Lint and build**

Run: `npm run lint && npm run build`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add tests/burn-status.spec.js
git commit -m "test: end-to-end coverage for the Fire Safety widget

Route-mocked Playwright tests on both the homepage and a sidebar page: a good
response fills every row and leaves no placeholders, and a 500, a garbage body,
and an aborted request each show the warning with a working phone link.

Uses very_high and restricted in the mock payload so the two values with no
live sighting are exercised in a real browser."
```

---

## Manual verification before opening a PR

- [ ] Run `npm run dev` and load `http://localhost:8080/` with devtools open. Confirm exactly one request to `permits.stationworks.app`, and that the widget matches the live API's current values.
- [ ] In devtools, throttle to offline and reload. Confirm the warning appears and the phone link dials.
- [ ] Load an interior page with the sidebar widget (`/services/burn-permits/`) and confirm the script loads once, not twice.
- [ ] Confirm no console errors on either page.
- [ ] Open TinaCMS (`npm run tina:dev`) and confirm the Burn Status collection shows `Burn Status (DEPRECATED — DO NOT EDIT)` with the warning description on the first field. **This is the only check that exercises the already-committed `tina/config.ts` change, which has never been typechecked** — `node_modules` was absent when it was written.

## Self-review notes

**Spec coverage:** every section maps to a task — data source and no-static-baseline rationale → Tasks 1–2; field mapping and normalisation → Tasks 2–3; dates → Task 2; failure/partial table → Task 4; CSS → Task 1; CSP → Task 1; workflow → Task 5; Tina deprecation → already committed in `69319a0`; testing → Tasks 2, 3, 4, 6.

**Deliberate deviation from the spec:** the spec's file list says `tina/config.ts` is modified as part of this work; it was committed early, during the design conversation. Noted under "Already on the branch" so nobody does it twice.

**Known untested surface:** `tina/config.ts` cannot be typechecked without `npm install` in this worktree. The manual verification step above is the gate.
