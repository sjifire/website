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

**Permit availability and burning legality are not the same thing.** Residential burn *permits* are
currently closed while county-wide residential burning remains allowed for now. So the stale `Open`
is not telling anyone to burn during a ban — it misstates whether permits can be obtained, next to a
fire danger level two steps low and a burn season a full year out of date.

That is still the defect this design exists to fix. The widget presents itself as current fire
safety information and is not current. It drifts silently, nothing in the build catches it, and
hand-maintained data that only updates when someone remembers to open TinaCMS will keep drifting.

**2. The air quality pipeline costs a commit and a redeploy per reading.**
`.github/workflows/update-air-quality.yml` runs hourly, fetches AirNow, and commits
`src/_data/air_quality.json` whenever the value moves. Since the feature merged on 2026-07-24 it has
produced **214 commits in 16 days** — about 13 site redeploys per day, and the throttle buys least
during a smoke event, when the number moves constantly and the site is under load.

A single upstream API now serves both concerns.

## Solution

Fetch `https://permits.stationworks.app/v1/agencies/sjifire/status` from the browser on every
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
fetch failure display a **confident, wrong answer** on rows the public reads as authoritative fire
safety guidance — and today's drift is the proof of how far that goes unnoticed: four misstated
status rows, a fire danger two levels low, a season a year out of date, no warning anywhere. A
widget that admits it does not know is safer than one that guesses, because a visitor who sees a
warning goes and checks.

The cost is real and accepted: no-JS visitors and crawlers never see live status values, only row
labels and a pointer to the burn permits page.

## Architecture

```
Server render (Eleventy):   structure only — labels, placeholders, aria-busy="true"
          ↓  fetch permits.stationworks.app  (every page load; HTTP-cached 120s)
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

#### Value normalisation

`fireDanger` and `state` arrive as **lowercase snake_case machine tokens**. Both enums are confirmed
by StationWorks:

- `fireDanger` — `low`, `moderate`, `high`, `very_high`, `extreme`
- `state` — `open`, `closed`, `restricted` (**all** status rows, permits included)

Each token drives two different outputs, so there are two transforms:

```js
// CSS class suffix: lowercase, runs of whitespace/underscore/hyphen → single hyphen
slugify("very_high")   // → "very-high"   → class "level--very-high"

// Display text: split on the same separators, capitalise each word, join with spaces
titleCase("very_high") // → "Very High"
```

| API token | CSS class | Displayed |
|---|---|---|
| `low` | `level--low` | Low |
| `moderate` | `level--moderate` | Moderate |
| `high` | `level--high` | High |
| `very_high` | `level--very-high` | Very High |
| `extreme` | `level--extreme` | Extreme |
| `open` | `level--open` | Open |
| `restricted` | `level--restricted` | Restricted |
| `closed` | `level--closed` | Closed |

Every class in that table already exists at `site.css:1296-1349`, so **no new CSS colors are
needed**. Both transforms also accept whitespace- and hyphen-separated input, so `"very high"` and
`"very-high"` produce identical output to `"very_high"` — the API is snake_case today and the widget
does not break if that ever changes.

**`restricted` on a permit row is new.** The TinaCMS schema only ever allowed `Open`/`Closed` for
residential and commercial permits — `Restricted` existed solely on the three recreational fields.
The API allows `restricted` on every status row, so the widget can now express a state the old
hand-edited data structurally could not. No special handling is required: rows are mapped uniformly
by slug and `level--restricted` already exists, so this works by construction rather than by a
per-row rule. It is called out because a reader comparing the two schemas will notice the
difference, and because the recreational-only assumption must not be carried into the code.

**`airQuality.category` is the exception: do not title-case it.** It arrives display-ready
(`"Good"`), and EPA's own label is `"Unhealthy for Sensitive Groups"` — title-casing every word
would render `Unhealthy For Sensitive Groups`, which is wrong. Use the string verbatim for display
and only slugify it for the `level--aqi-*` class, exactly as the Liquid template did.

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

On failure the "Burn Season:" line in the header is hidden too — a season range is a status claim,
and showing it above an "unavailable" message implies the widget knows more than it does.

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

Add `https://permits.stationworks.app` to `connect-src` in the CSP `globalHeaders`. This widens
the CSP by exactly one host and is the only security-relevant edit. No routing change — nothing is
added under `/api/`, so the admin auth gate is untouched.

### `.github/workflows/update-air-quality.yml` (modified)

Remove the `schedule:` block; keep `workflow_dispatch`. The workflow and
`scripts/generate-air-quality.mjs` remain fully functional and manually runnable — the logic stays
in the repo per the explicit request — but nothing runs on a timer and nothing auto-commits.

`scripts/generate-air-quality.mjs` is **unchanged**.

### `tina/config.ts` (modified — deprecation notice only)

The `configBurnStatus` collection keeps working; it is labelled as dead so nobody edits it by
mistake. Two changes, both using long-stable Tina schema properties:

- Collection `label` → `"Burn Status (DEPRECATED — DO NOT EDIT)"`, so the warning is visible in the
  sidebar list before anyone opens the screen.
- A `description` on the first field (`fire_status`, which renders at the top of the form) stating
  that edits no longer appear on the website, that burn status is now changed in the StationWorks
  permits system, that **saving here will succeed and change nothing public**, and that the screen
  will be removed shortly.

The "saving will succeed and change nothing" sentence is the important one. The failure mode is not
an error; it is silence, and an editor mid-incident needs to be told that explicitly rather than
inferring it from a label.

No fields are removed and no data is migrated, so this is fully reversible.

> **Follow-up, not covered here.** "Will be removed shortly" is a promise this change does not keep.
> Deleting the collection, `burn_status.json`, and `air_quality.json` is a separate small change once
> the API-driven widget has run in production long enough to trust.

### Deliberately untouched

`src/_data/burn_status.json` and `src/_data/air_quality.json` stay exactly as they are. Nothing
reads them after this change.

## Testing

**Unit** (`tests/burn-status.test.js`, `node --test` + JSDOM), matching the existing
`tests/carousel.test.js` pattern — read the script file, execute it against a constructed DOM, stub
`fetch`. Fixture at `tests/fixtures/agency-status.json`, the captured live response above.

- full fixture patches all seven rows, the season header, and the AQI link `href`
- `aria-busy` is removed on **both** success and failure — the widget is no longer loading either
  way, and leaving it set would tell a screen reader the content is still arriving
- **table-driven over the full confirmed enums** — each of `low`, `moderate`, `high`, `very_high`,
  `extreme`, `open`, `restricted`, `closed` produces its expected display text and its expected
  `level--*` class. `very_high` → `Very High` / `level--very-high` is the one most likely to regress.
- `restricted` renders correctly on a **permit** row, not just a recreational one — the case the old
  Tina schema could not represent
- separator tolerance: `"very high"` and `"very-high"` produce the same output as `"very_high"`
- `airQuality.category` is **not** title-cased — `"Unhealthy for Sensitive Groups"` renders verbatim
  with class `level--aqi-unhealthy-for-sensitive-groups`, not `Unhealthy For Sensitive Groups`
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
- **Removing the Tina collection or the orphaned JSON data files.** This change only marks the
  collection deprecated; deletion is the follow-up noted above.
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
