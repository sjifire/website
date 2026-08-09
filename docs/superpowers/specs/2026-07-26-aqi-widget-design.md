# Air Quality Widget — Client-Side Data Source

**Date:** 2026-07-26
**Status:** SUPERSEDED on 2026-08-09 by `2026-08-09-burn-status-from-api-design.md` — never implemented.
**Branch:** `worktree-aqi-client-side` (based on `origin/main` @ `adb1c2f`)

> **Why this was retired.** The whole Fire Safety widget now reads live from the StationWorks
> permits API, which supplies air quality alongside burn status in a single fetch. That removed the
> hourly AirNow commit churn this spec set out to fix, so the remaining reason to build it was
> hyperlocality alone.
>
> **The accuracy argument below still stands and was not refuted.** The replacement uses the API's
> Anacortes reading — 18.5 mi away across open water — where this spec had identified a corrected
> PM2.5 sensor 2.5 mi out, on the island. Reviving it means adding a second fetch that overrides
> the air-quality row after the primary patch. The verified findings here (the 2024 EPA breakpoint
> table, the official-first tiering, the median-not-mean reasoning) are the reason to keep this
> document rather than delete it.
>
> Its captured fixture, `tests/fixtures/near-me.json`, was left untracked in the
> `aqi-client-side` worktree and is not carried into this branch.

## Problem

The Fire Safety widget's "Air Quality & Smoke" row is already built and shipped. Its *data
acquisition* is the problem, in two ways.

**1. It costs a commit and a redeploy.** `.github/workflows/update-air-quality.yml` runs hourly,
fetches AirNow, and commits `src/_data/air_quality.json` when the reading moves. The workflow does
throttle — `generate-air-quality.mjs` only rewrites the file when AQI moves ≥5% or the category
changes — but `main` still carries long runs of consecutive `chore: update air quality data from
AirNow` commits. The throttle buys least exactly when it matters most: during a smoke event the
number moves constantly, so commits and redeploys are most frequent precisely when the site is
under load and the history should stay readable.

**2. The number describes the wrong place.** The live data file reads:

```json
{ "aqi": 18, "category": "Good", "pollutant": "O3", "reporting_area": "Anacortes" }
```

Anacortes is 18.5 mi away across open water, and the reported pollutant is **ozone, not PM2.5** —
the wrong pollutant for wildfire smoke. This is not a defect in the script; it is the honest output
of AirNow's regulatory network. Verified: the three nearest AirNow monitors to Friday Harbor are
Victoria Topaz (17.1 mi, Canada), Saturna (17.5 mi, Canada), and Anacortes (18.5 mi). **There is no
regulatory monitor on San Juan Island.**

`generate-air-quality.mjs` already documents this in its header, and already links the widget to
the AirNow Fire and Smoke Map "for live, hyperlocal smoke coverage." This design takes the next
step: read that map's data directly, rather than linking users to a map that disagrees with the
number printed beside it.

## Solution

Fetch the Fire and Smoke Map's own backing service from the browser. Keep the existing AirNow
pipeline as a low-frequency, server-rendered baseline.

### Data source

```
https://near-me.airfire.org/near-me/?lat=48.5343&lng=-123.017&maxDistanceMiles=20&limit=11
```

This is the endpoint `fire.airnow.gov` itself calls. Verified live on 2026-07-26:

- Returns `access-control-allow-origin: *` — callable cross-origin from the browser.
- Requires no API key, so nothing needs hiding and there is no shared rate-limited quota.
- Cleanly separates official from crowd-sourced data: `aqMonitors[]` carries `instrument: "FEM"`
  and `deployment_type` (`Permanent` / `Temporary`); `purpleAir[]` and `clarity[]` are the low-cost
  networks.
- Returns 11 PurpleAir sensors within 20 mi of Friday Harbor, the nearest **2.5 mi** — on the
  island — measuring **PM2.5**, the pollutant that tracks smoke.
- PurpleAir entries arrive **already corrected**: each carries `corrected_pm25`, `nowcast`, and a
  finished `aqi`, with EPA's US-wide PurpleAir correction and NowCast algorithm applied upstream.
  We do not implement the correction equation.

Captured response committed at `tests/fixtures/near-me.json`.

Fields used:

- **`aqMonitors[]`** — `{ site_name, source, deployment_type, instrument, nowcast, raw_pm25,
  distanceMiles, local_ts }`
- **`purpleAir[]`** — `{ unit_id, aqi, corrected_pm25, nowcast, raw_pm25, status, latency_mins,
  distanceMiles, direction, local_ts, trend }`

### Known risk: the endpoint is undocumented

There is no published contract, SLA, or terms of use for `near-me.airfire.org`. EPA could change
the shape or drop the permissive CORS header without notice.

This is acceptable because of the fallback structure below: if the fetch fails, the widget keeps
showing the server-rendered AirNow value. The failure mode is "the number is less local than it
could be," not "the widget is broken." Nothing in the build depends on it.

## Architecture

Progressive enhancement. The server renders an AirNow baseline; the browser upgrades it in place.

```
Server render (Eleventy, from air_quality.json):   AQI 18 · Anacortes (O3)
                    ↓ client-side JS, on success
Client render:                                     AQI  2 · Sensor 2.5 mi (PM2.5)
```

No-JS users, first paint, and any fetch failure all land on the AirNow value. Success upgrades it.

### `.github/workflows/update-air-quality.yml` (modified)

Change the cron from hourly (`0 * * * *`) to **daily**. Nothing else changes — the ≥5% /
category-change throttle in `generate-air-quality.mjs` stays and still suppresses no-op commits.

This is now a *baseline* generator, not the live number, so daily resolution suffices. Commits drop
roughly 24×.

Update the cron comment, which currently explains the hourly cadence and would otherwise mislead.

### `scripts/generate-air-quality.mjs` (unchanged)

No changes. It keeps producing the AirNow baseline exactly as today, including its
leave-the-file-alone-on-API-failure behaviour.

### `src/_includes/burn-status-widget.liquid` (modified)

Keep the existing row and its server-rendered content. Add stable hooks so JS can patch in place
rather than rebuild markup:

- `id="aqi-row"` on the `<tr>`
- `id="aqi-cell"` on the `<td class="level ...">`
- `id="aqi-score"` on `.level__score`
- `id="aqi-label"` on `.level__label`
- `id="aqi-source"` on the `<aside>`

The `{% if air_quality.aqi %}` guard, the `<a href="{{ air_quality.source_url }}">` link to the
Fire and Smoke Map, and all existing classes stay as they are.

Load the script from within the partial, so it ships only where the widget renders:

```liquid
<script defer src="/js/air-quality.js"></script>
```

The widget renders at `page.liquid:20` (sidebar) and `homepage.liquid:110` — never both on one
page, so no duplicate load.

### `src/css/site.css` (unchanged)

No changes. All six EPA categories already exist at `site.css:1320-1349` (`level--aqi-good`,
`-moderate`, `-unhealthy-for-sensitive-groups`, `-unhealthy`, `-very-unhealthy`, `-hazardous`),
along with `.level__score`, `.level__label`, and `.widget__nowrap`. The client-side code reuses
these class names verbatim.

### `src/js/air-quality.js` (new)

Plain browser IIFE matching the `src/js/carousel.js` / `gallery.js` convention — no modules, no
build step, early-return guard, 2-space indent. Passthrough-copied to `/js/` by `.eleventy.js:35`.

Flow: read `localStorage`; if stale, fetch; on success select a reading and patch the DOM; on any
failure leave the server-rendered baseline untouched.

**Dual-mode export** so the pure logic is unit-testable under `node --test`:

```js
(function () {
  'use strict';

  function selectReading(payload) { /* pure — no DOM, no network */ }
  function pm25ToAqi(pm) { /* pure */ }
  function aqiCategory(aqi) { /* pure */ }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { selectReading, pm25ToAqi, aqiCategory };
    return; // never touch the DOM under Node
  }

  // browser-only: cache, fetch, patch DOM
})();
```

#### Reading selection — official first

`selectReading(payload)` returns `null` if every tier fails, which is the signal to leave the
baseline alone.

1. **Nearby official monitor.** `aqMonitors[]` entries with `distanceMiles <= 10`, nearest wins.
   Covers both `Permanent` and `Temporary` deployments.
2. **On-island corrected sensors.** `purpleAir[]` entries with `status === 0` and
   `distanceMiles <= 10`. Report the **median** `aqi`.
3. **Nearest official monitor at any distance.** Closest `aqMonitors[]` entry, unbounded.
4. **Nothing.** Return `null`.

**Why official-first with a distance gate.** Regulatory monitors are authoritative and citable, so
they should win — but only when they actually describe local air. Nothing official is within 10 mi
today, so tier 1 is empty and the widget shows the 2.5 mi sensor. The value of the gate is
automatic: agencies deploy **temporary official monitors during smoke events**, and those appear in
`aqMonitors` with `deployment_type: "Temporary"`. The widget then upgrades itself to an official
reading exactly when officialness matters most, with no code change.

Tiers 1 and 3 are the same source split by distance deliberately: a monitor 18 mi away is a poor
description of island air (tier 3, last resort) but is still better than nothing.

**Median, not mean, in tier 2.** In the captured fixture three neighbouring sensors read AQI 0–2
while sensor #78735 read 11. One miscalibrated or smoulder-adjacent sensor must not move the public
number; the median is robust to that, the mean is not.

Returned shape:

```js
{ aqi, category, source: 'monitor' | 'sensor', label, distanceMiles, pollutant, sensorCount }
```

#### PM2.5 → AQI conversion (tiers 1 and 3)

`aqMonitors[]` entries carry **no `aqi` field** — only `nowcast`, which is **PM2.5 in µg/m³**. Both
official tiers must convert. (Tier 2 needs no conversion; `purpleAir[]` ships a finished `aqi`.)

Use EPA's **2024 revised** PM2.5 breakpoints — the Good band is **0–9.0 µg/m³**, not the legacy
0–12.0.

This is not a guess. Comparing each sensor's `nowcast` against its service-supplied `aqi` across all
11 sensors in the fixture, the 2024 table reproduces every value and the legacy table reproduces
none:

| `nowcast` | service `aqi` | legacy (0–12) | 2024 (0–9) |
|---|---|---|---|
| 0.3 | 2 | 1.2 ✗ | 1.7 ✓ |
| 2.0 | 11 | 8.3 ✗ | 11.1 ✓ |
| 1.7 | 9 | 7.1 ✗ | 9.4 ✓ |
| 1.1 | 6 | 4.6 ✗ | 6.1 ✓ |

The legacy table would under-report by roughly 25% and disagree with the Fire and Smoke Map the
widget links to. Linear interpolation within the band, rounded to nearest integer.

**Clamp negatives to 0.** Monitor `nowcast` can go negative near the detection floor — Anacortes
reported `-0.4` in the fixture.

#### DOM patch

On a successful reading:

- `#aqi-cell` — swap the `level--aqi-*` class to match the new category, using the same slug
  convention the Liquid template produces (`category | slugify`).
- `#aqi-score` — the AQI number.
- `#aqi-label` — `AQI · <category>`.
- `#aqi-source` — `Sensor 2.5 mi · PM2.5` for tier 2, or `Nearest monitor: <site_name> · PM2.5` for
  tiers 1 and 3, matching the existing wording pattern.

The link `href` is left alone; it already points at the Fire and Smoke Map.

Patch all fields or none — never leave the row showing a new score beside a stale category colour.

#### Caching

`localStorage`, TTL **30 minutes**.

The original ask was 5 minutes, sized against AirNow's 500/hr shared-key limit. That limit does not
apply here — no key, and each visitor spends their own connection rather than a pooled quota.
Meanwhile the payload reports `latency_mins: 45` and timestamps advance hourly, so a 5-minute TTL
would re-fetch ~10× per new data point. 30 minutes gives identical freshness for a tenth of the
requests.

Cache the *selected reading*, not the raw payload.

### `staticwebapp.config.json` (modified)

Add `https://near-me.airfire.org` to `connect-src` in the CSP `globalHeaders`. This is the only
configuration change and the only security-relevant edit — it widens the CSP by exactly one host.

No routing change: nothing is added under `/api/`, so the `/api/*` admin gate is untouched.

## Testing

**Unit** (`tests/air-quality.test.js`, `node --test`), against `tests/fixtures/near-me.json`:

- tier 1 wins when an official monitor is within 10 mi (synthesised, since the fixture has none)
- tier 2 is used when no official monitor is within 10 mi — the fixture's real case
- median selection across multiple in-range sensors
- outlier sensor does not move the result (the 0/0/2/11 case)
- `status !== 0` sensors excluded
- sensors beyond 10 mi excluded
- tier 3 used when no sensor qualifies and no official monitor is within 10 mi
- returns `null` when every tier is empty
- `pm25ToAqi` reproduces the service's own `aqi` for all 11 fixture sensors — the regression test
  that pins the 2024 breakpoints
- negative monitor `nowcast` clamps to 0
- category boundaries at 50/51, 100/101, 150/151, 200/201, 300/301

**E2E** (Playwright), with the network route mocked:

- good response upgrades the row: score, label, source text, and `level--aqi-*` class all change
- 500 / timeout / malformed body each leave the server-rendered baseline intact and visible
- fresh `localStorage` entry suppresses a second network call
- the row is never left empty or half-patched

## Out of scope

- Removing the AirNow pipeline. It stays as the baseline and fallback.
- Any server-side component. (Rejected alternative: an `/api/aqi` Azure Function proxying AirNow,
  which would reintroduce the key and the rate limit this design removes.)
- **`clarity[]` sensors.** The array was empty in the captured payload, so its field shape is
  unverified; speccing against a structure never observed would be guesswork. Worth revisiting if a
  Clarity sensor ever appears near the island — it would slot into tier 2.
- Historical AQI, charts, or trend arrows — the payload carries `trend`, but the widget shows one
  current number.
- Adding `src/js/` to the `lint:js` glob. It is currently unlinted; changing that is unrelated
  cleanup that would touch existing files.
