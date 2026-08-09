# Fire Safety Widget — Runtime Data from the StationWorks Permits API

**Date:** 2026-08-09
**Status:** Approved, pending implementation plan
**Branch:** `feat/burn-status-from-api` (based on `origin/main` @ `02c7d16`)
**Supersedes:** `2026-07-26-aqi-widget-design.md`

## Problem

The Fire Safety widget renders entirely from files committed to the repo, and both of its data
sources have gone wrong in different ways.

**1. The burn status is stale and contradicts reality.** `src/_data/burn_status.json` is
TinaCMS-edited by hand. As of today it disagrees with the live permit system on every field that
matters:

| Field | `burn_status.json` | StationWorks API |
|---|---|---|
| Fire danger | `Low` | `high` |
| Residential burn permits | `Open` | `closed` |
| Commercial burn permits | `Open` | `closed` |
| Recreational — DNR / NPS | `Open` | `closed` |
| Burn season | 2025-10-06 – 2026-06-15 | 2026-10-06 – 2027-06-05 |

The residential row is the one the public acts on. Right now the website tells islanders that
burning is permitted during a burn ban. That is the defect this design exists to fix; everything
else here follows from it.

**2. The air quality pipeline costs a commit and a redeploy per reading.**
`.github/workflows/update-air-quality.yml` runs hourly, fetches AirNow, and commits
`src/_data/air_quality.json` whenever the value moves. Since the feature merged on 2026-07-24 it has
produced **214 commits in 16 days** — about 13 site redeploys per day, and the throttle buys least
during a smoke event, when the number moves constantly and the site is under load.

A single upstream API now serves both concerns.

## Solution

Fetch `https://api.permits.stationworks.app/v1/agencies/sjifire/status` from the browser on every
page load and render the whole widget from the response. No build-time data, no committed baseline,
no static fallback.

### Data source

Verified live on 2026-08-09:

```json
{
  "agency":   { "slug": "sjifire", "displayName": "San Juan Island Fire & Rescue" },
  "season":   { "start": "2026-10-06", "end": "2027-06-05" },
  "fireDanger": "high",
  "statuses": [
    { "slug": "residential",          "label": "Residential Burn Permits", "state": "closed",
      "permitTypeSlug": "residential", "linkUrl": null, "section": null },
    { "slug": "commercial",           "label": "Commercial Burn Permits",  "state": "closed", ... },
    { "slug": "recreational-county",  "label": "County lands",             "state": "open",
      "section": "recreational-fires" },
    { "slug": "recreational-dnr",     "label": "State Park & DNR lands",   "state": "closed", ... },
    { "slug": "recreational-nps",     "label": "National Park lands",      "state": "closed", ... }
  ],
  "airQuality": { "station": "Anacortes", "pm25Aqi": 17, "category": "Good",
                  "categoryNumber": 1, "observedAt": "2026-08-09T17:00:00.000Z",
                  "linkUrl": "https://www.airnow.gov/?reportingArea=Anacortes&stateCode=WA" },
  "asOf": "2026-08-09T17:35:39.339Z"
}
```

Response headers confirm it is browser-callable and self-throttling:

- `access-control-allow-origin: *` — callable cross-origin, no proxy needed.
- `cache-control: public, max-age=120, stale-while-revalidate=300` — the CDN and the browser HTTP
  cache absorb repeat loads. **This is why there is no `localStorage` layer:** a client-side cache
  would duplicate a job the response headers already do correctly.
- Served via CloudFront; no API key, so nothing needs hiding and there is no shared quota.

### Why no static baseline

Considered and rejected: keeping `burn_status.json` as a server-rendered baseline that JS upgrades.
It reads as the safe choice and is the opposite. A stale baseline means the no-JS path and every
fetch failure display a **confident, wrong, legally-relevant answer** — "Residential Burn Permits:
Open" during a ban. A widget that admits it does not know is strictly safer than one that guesses,
because a visitor who sees a warning goes and checks, and a visitor who sees "Open" lights a fire.

The cost is real and accepted: no-JS visitors and crawlers never see live status values, only row
labels and a pointer to the burn permits page.

## Architecture

```
Server render (Eleventy):   structure only — labels, placeholders, aria-busy="true"
          ↓  fetch api.permits.stationworks.app  (every page load; HTTP-cached 120s)
   success:                 all rows patched together, aria-busy removed
   failure:                 tbody replaced with a single warning row
```

### `src/_includes/burn-status-widget.liquid` (modified)

Rows stay **hardcoded** — same labels, same order as today. The template stops referencing
`burn_status` and `air_quality` entirely and instead renders placeholders with stable hooks:

- `data-burn-status` on the `<table>` — the script's mount point and early-return guard
- `id="burn-season"` on the header `.timeframe`
- `data-row="fire-danger"` / `"air-quality"` / `"residential"` / `"commercial"` /
  `"recreational-county"` / `"recreational-dnr"` / `"recreational-nps"` on each `<td class="level">`
- Inside the air-quality cell, the existing `.level__score`, `.level__label`, and `<aside>` keep
  their structure; the script patches their text and the anchor's `href`.

Placeholder cells render `—` with `class="level level--unknown"`, and the table carries
`aria-busy="true"` until the patch completes.

The air-quality cell is the one exception to that shape: it ships its full anchor / `.level__score`
/ `.level__label` / `<aside>` structure with empty text and an `href` of `#`, and the row starts
`hidden`. The script unhides it only after a valid `airQuality` block is mapped, so a payload
without one never flashes an empty row.

The `{% if page.url == '/' %}` footer link stays as-is.

Load the script from within the partial so it ships only where the widget renders:

```liquid
<script defer src="/js/burn-status.js"></script>
```

The widget renders at `page.liquid:20` (sidebar) and `homepage.liquid:110` — never both on one page,
so there is no duplicate load. Both `render` calls drop their now-unused `burn_status:` and
`air_quality:` arguments.

### `src/js/burn-status.js` (new)

Plain browser IIFE matching the `src/js/carousel.js` / `gallery.js` convention — no modules, no
build step, early-return guard, 2-space indent. Passthrough-copied to `/js/` by `.eleventy.js:35`.

#### Field mapping

| Widget row | API path |
|---|---|
| Burn Season (header) | `season.start` / `season.end` |
| Fire Danger | `fireDanger` |
| Air Quality & Smoke | `airQuality.pm25Aqi`, `.category`, `.station`, `.linkUrl` |
| Residential Burn Permits | `statuses[slug="residential"].state` |
| Commercial Burn Permits | `statuses[slug="commercial"].state` |
| Recreational Fires: San Juan County | `statuses[slug="recreational-county"].state` |
| Recreational Fires: State Park & DNR | `statuses[slug="recreational-dnr"].state` |
| Recreational Fires: National Parks | `statuses[slug="recreational-nps"].state` |

The API sends lowercase (`"high"`, `"closed"`). Display title-cases each word (`"very high"` →
`Very High`). The CSS class slugifies: lowercase, then collapse any run of whitespace or
underscores to a single hyphen (`"very high"` and `"very_high"` both → `level--very-high`). This
reproduces what Liquid's `slugify` produced before, and is deliberately tolerant because the exact
casing and separator the API uses for multi-word danger levels has not been observed — only
`"high"` has been seen live.

**No new CSS colors are needed.** Every class already exists at `site.css:1296-1349`:
`level--low`, `--moderate`, `--high`, `--very-high`, `--extreme`, `--open`, `--restricted`,
`--closed`, and the six `level--aqi-*`.

#### Dates

`season.start` and `season.end` are **date-only strings** (`"2026-10-06"`). Parse as UTC and format
in UTC. Naive `new Date("2026-10-06")` renders as Oct 5 in Pacific time — an off-by-one on a
public-facing date. Target format is `Oct 6`, matching `postDateTerseNoYearISO`
(`{ month: "short", day: "numeric" }`, `src/_lib/date-utils.js:176`), producing the existing
`Burn Season: Oct 6-Jun 5`.

#### Failure and partial data

**Map the entire payload before touching the DOM.** Patch all fields or none — the widget must never
show a new value beside a stale category color, or a half-filled table.

| Condition | Behavior |
|---|---|
| Fetch throws / non-2xx / unparseable JSON | Warning row |
| No `statuses` array, or it is empty | Warning row |
| A mapped slug is absent from `statuses[]` | That row alone shows `—` / `level--unknown` |
| `fireDanger` absent | That row alone shows `—` / `level--unknown` |
| `airQuality` null or absent | Hide the air-quality row (matches today's `{% if %}`) |
| `pm25Aqi` non-numeric or negative | Hide the air-quality row |
| `season` absent | Omit the "Burn Season:" line from the header |
| Unrecognised state value (e.g. a future `"partial"`) | Render the text, no color class |

The last row matters: an unknown state degrades to *uncolored but readable*, never to a wrong color.
A green "Partial" would be worse than a plain one.

The warning replaces the tbody with a single cell:

> ⚠ Live fire status unavailable. Call (360) 378-5334 or see Burn Permits ›

`(360) 378-5334` is the office number from `footer.liquid:47`; Burn Permits links to
`/services/burn-permits/`.

#### Request handling

- `fetch` with an `AbortController` timeout so a hung connection surfaces the warning rather than
  leaving the skeleton up indefinitely.
- Default cache mode — the point is to let `max-age=120` work.
- No retry. The next page load is the retry.

### `src/css/site.css` (modified)

Two small additions only:

- `.level--unknown` — muted placeholder treatment for `—`.
- A warning-row style for the failure state, using existing widget typography.

### `staticwebapp.config.json` (modified)

Add `https://api.permits.stationworks.app` to `connect-src` in the CSP `globalHeaders`. This widens
the CSP by exactly one host and is the only security-relevant edit. No routing change — nothing is
added under `/api/`, so the admin auth gate is untouched.

### `.github/workflows/update-air-quality.yml` (modified)

Remove the `schedule:` block; keep `workflow_dispatch`. The workflow and
`scripts/generate-air-quality.mjs` remain fully functional and manually runnable — the logic stays
in the repo per the explicit request — but nothing runs on a timer and nothing auto-commits.

`scripts/generate-air-quality.mjs` is **unchanged**.

### Deliberately untouched

`src/_data/burn_status.json`, `src/_data/air_quality.json`, and the `configBurnStatus` collection in
`tina/config.ts` all stay exactly as they are. Nothing reads them after this change.

> **Known trap, accepted with eyes open.** TinaCMS keeps showing a "Burn Status" editor whose edits
> no longer affect the public site. An editor can change residential permits to `Open` in Tina, see
> it save, and have the website continue showing `Closed` from the API — with no error and no
> explanation. This is documented in `CLAUDE.md` as part of this change. Removing the collection
> from `tina/config.ts` is the fix if it ever bites; it was considered and consciously deferred to
> keep this diff small and reversible.

## Testing

**Unit** (`tests/burn-status.test.js`, `node --test` + JSDOM), matching the existing
`tests/carousel.test.js` pattern — read the script file, execute it against a constructed DOM, stub
`fetch`. Fixture at `tests/fixtures/agency-status.json`, the captured live response above.

- full fixture patches all seven rows, the season header, and the AQI link `href`
- `aria-busy` is removed on success and retained on failure
- lowercase API values render title-cased with the correct `level--*` class
- season renders `Oct 6-Jun 5`, **not** `Oct 5-Jun 4` — the UTC regression test
- a slug missing from `statuses[]` leaves that one row at `—` and patches the rest
- absent `airQuality` hides the row; negative and non-numeric `pm25Aqi` also hide it
- unrecognised state renders its text with no color class
- non-2xx, network rejection, malformed JSON, and empty `statuses` each produce the warning
- no failure path leaves a partially patched table

**E2E** (`tests/burn-status.spec.js`, Playwright with `page.route` mocking):

- good response fills every row on both the homepage and a sidebar page
- 500, timeout, and garbage body each show the warning with a working phone link
- the widget is never blank and never half-filled

## Out of scope

- **Removing the AirNow pipeline.** The script and workflow stay, manually runnable.
- **Removing the Tina collection or the orphaned JSON data files.** See the trap note above.
- **Per-status `linkUrl`.** The API carries it on each status but sends `null` for all of them
  today. Only `airQuality.linkUrl` is consumed. Worth revisiting if the API starts populating it.
- **Rendering rows dynamically from `statuses[]`.** Considered — it would let StationWorks add a
  permit type with no deploy, and would use the API's own `section` grouping. Rejected for this pass
  in favor of keeping today's exact labels and order. A new permit type therefore requires a code
  change; an unknown slug in the response is ignored.
- **Hyperlocal PM2.5.** `2026-07-26-aqi-widget-design.md` specced reading `near-me.airfire.org` for
  an on-island PurpleAir sensor 2.5 mi out. The API's Anacortes reading is 18.5 mi away across open
  water. That spec is superseded and its accuracy argument remains valid; reviving it would mean a
  second fetch that overrides the air-quality row.
- **`asOf` / staleness display.** The payload carries a timestamp; the widget shows current values
  without a "last updated" line, as today.
