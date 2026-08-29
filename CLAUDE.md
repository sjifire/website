# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

San Juan Island Fire & Rescue public website. Static site built with Eleventy (11ty) v3 and TinaCMS for content management. Deployed to Azure Static Web Apps with Azure AD authentication for the admin interface.

## Build Commands

```bash
npm run dev          # Local 11ty dev server with live reload
npm run tina:dev     # TinaCMS editor + 11ty server (for content editing)
npm run build        # Production static build to _site/
npm run tina:build   # TinaCMS build + static site build
npm run api:dev      # Run Azure Functions API locally
npm start            # Parallel: dev + api:dev
```

Requires Node.js 22 (see `.nvmrc`). Output goes to `_site/`.

Node 22 is used everywhere — CI, the scheduled workflows, and the deployed
Functions host via `platform.apiRuntime` in `staticwebapp.config.json`. It is not
the newest LTS (24 is), but Azure Static Web Apps' `apiRuntime` supports no version
above `node:22`, so 22 is the highest version the API can run. Building on a newer
version than the API executes on is what this pin exists to prevent.

## Architecture

### Directory Structure

- `src/_data/` - Global data: site config (`site.json`), page data (`.yml`), dynamic loaders (`posts.js`, `media_releases.js`)
- `src/_includes/` - LiquidJS templates: `base.liquid` (root layout), `page.liquid` (page layout with sidebar support), widgets, header/footer
- `src/pages/` - Content pages (`.liquid`/`.md`/`.mdx`) - URLs generated without `/pages/` prefix via `pages.11tydata.js`
- `src/posts/` - News posts as JSON files (`YYYY-MM-DD-slug.json`)
- `src/media_releases/` - Press release metadata (JSON) linking to PDFs in `src/assets/media_releases/`
- `scripts/` - Standalone ESM scripts for data sync (NERIS, M365 personnel)
- `api/` - Azure Functions backend for GitHub content operations and auth

### Key Patterns

**Template inheritance**: `base.liquid` → `page.liquid` → page templates. Pages use Eleventy's layout frontmatter (`layout: page` or `layout: base`). The `page.liquid` layout auto-selects two-column or single-column layout based on sidebar presence in frontmatter.

**Content types**: Pages use YAML data files in `_data/` (e.g., `homepage.yml`). Posts and media releases are JSON files loaded by dynamic data files (`posts.js`, `media_releases.js`).

**Date handling**: All dates use Luxon with explicit UTC timezone to avoid DST issues. Multiple date filters exist for different formats (`postDateTerseISO`, `postDateVerboseISO`, etc.).

**Image optimization**: Production builds use Cloudinary via `imgPath` shortcode for automatic format conversion and optimization.

### Adding New Images

**IMPORTANT:** When adding new images to the site (e.g., from user-provided folders), always optimize them through Cloudinary before saving to reduce disk space.

```bash
# Single file with new name/location
node scripts/optimize-image.mjs ~/Downloads/photo.jpg src/assets/media/descriptive_name.jpg

# Optimize existing files in-place
node scripts/optimize-image.mjs src/assets/media/gallery/

# Optimize specific files in-place
node scripts/optimize-image.mjs file1.jpg file2.jpg file3.jpg
```

The script automatically:
- Skips files under 500KB (already small enough)
- Skips if optimized result isn't smaller than original
- Resizes to max 2000x2000, auto quality

Typically reduces file sizes by 80-90%. Requires Cloudinary credentials in `.env` (`CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`).

**Adding photo credits / watermarks:**
```bash
# Watermark images with photographer credit (baked into the file)
node scripts/watermark-image.mjs --credit "Photographer Name" image1.jpg [image2.jpg ...]
```
Always watermark on fresh (un-watermarked) images — the text is baked in permanently. If you need to redo a watermark, restore the original from git first (`git show <commit>:path/to/file > path/to/file`).

**Image naming conventions:**
- Use lowercase with underscores: `brigade_water_rescue_training.jpg`
- Use descriptive names that indicate content
- Place general images in `src/assets/media/`
- Place gallery-worthy action shots in `src/assets/media/gallery/`

### Configuration Files

- `.eleventy.js` - 11ty config with custom LiquidJS engine, filters (groupby, dictsort, round, slugify), shortcodes (imgPath), passthrough copies
- `.tina/config.ts` - TinaCMS schema and media configuration
- `staticwebapp.config.json` - Azure routing, auth (requires AAD tenant ID), CSP headers

### Authentication

Admin routes (`/admin/*`, `/api/*`) require Azure AD authentication. Access is controlled via Enterprise App user assignments in Entra ID. The app verifies "User assignment required" is enabled via Graph API before granting the admin role.

### Incident Statistics (NERIS)

Incident statistics are pulled daily from NERIS (National Emergency Response Information System) via a scheduled GitHub Action.

**Files:**
- `scripts/neris-client.mjs` - ESM API client for NERIS REST API
- `scripts/generate-stats.mjs` - Fetches incidents and generates `src/_data/stats.json`
- `.github/workflows/update-stats.yml` - Daily scheduled workflow (6 AM UTC)

**Required GitHub Secrets:**
- `NERIS_CLIENT_ID` - OAuth2 client ID from NERIS
- `NERIS_CLIENT_SECRET` - OAuth2 client secret
- `NERIS_ENTITY_ID` - Fire department NERIS ID

**Local Testing:**
```bash
export NERIS_CLIENT_ID="your-client-id"
export NERIS_CLIENT_SECRET="your-client-secret"
export NERIS_ENTITY_ID="your-entity-id"
npm run stats
```

### Personnel Data (Microsoft 365)

Personnel data and photos are synced daily from Microsoft 365 via Microsoft Graph API, using Entra ID user attributes.

**Entra ID Attributes Used:**
- `employeeType` - Determines staff/volunteer classification:
  - Administrative, Day Staff, FT Line Staff, PT Line Staff → "staff"
  - Volunteer → "volunteer"
  - Users without employeeType are excluded
- `extensionAttribute1` - Rank (Chief, Battalion Chief, Captain, Lieutenant, etc.)
- `extensionAttribute2` - Apparatus Operator certification expiration date (if future date, adds "Apparatus Operator" role)
- `extensionAttribute3` - Comma-separated roles, simplified to: Marine Crew (Marine: Mate/Pilot/Deckhand), Firefighter, Wildland Firefighter, Support
- `jobTitle` - Display title

**Files:**
- `scripts/msgraph-client.mjs` - Microsoft Graph API client (uses official @microsoft/microsoft-graph-client SDK)
- `scripts/sync-personnel.mjs` - Syncs users/photos to `src/_data/personnel.json`
- `scripts/image-hash.mjs` - Perceptual hashing for photo change detection
- `.github/workflows/sync-personnel.yml` - Daily scheduled workflow (7 AM UTC)

**Secrets:**
- From Key Vault: `MS-GRAPH-TENANT-ID`, `MS-GRAPH-CLIENT-ID`, `MS-GRAPH-CLIENT-SECRET`, `CLOUDINARY-API-KEY`, `CLOUDINARY-API-SECRET`
- From GitHub Secrets: `DEPLOY_KEY` (SSH deploy key for pushing changes)

**Local Testing:**
```bash
./scripts/pull-secrets.sh    # Populate .env from Key Vault
npm run sync-personnel
```

### Fire Safety Widget (Burn Status + Air Quality)

The Fire Safety widget reads **live at runtime** from the StationWorks permits
API. Nothing about it is baked in at build time.

**Endpoint:** `https://permits.stationworks.app/v1/agencies/sjifire/status`
(CORS-open, no API key,
`cache-control: public, max-age=120, stale-while-revalidate=300`)

Note the `stale-while-revalidate`: worst-case staleness is ~7 minutes, not 2.
Inside the SWR window the browser serves the cached body immediately and
revalidates in the background, so a status change made at the district can take
up to 420s to reach a visitor. The widget has no cache-busting of its own -- the
response headers do all the throttling.

One response supplies the whole widget: burn season, fire danger, all five
permit/recreational statuses, and air quality.

**Files:**
- `src/_data/site.json` - `burn_status_api` is the **canonical URL**. Everything
  below derives from it.
- `src/_includes/base.liquid` - starts the fetch during head parse and publishes
  the URL as `window.__burnStatusEndpoint`. Derives the preconnect origin with
  `| split: '/v1/' | first`, so that origin must match the CSP exactly.
- `src/_includes/burn-status-widget.liquid` - renders structure only (row labels,
  placeholder cells, `data-*` hooks). Contains no data references.
- `src/js/burn-status.js` - fetches on every page load and patches the cells.
  Maps the entire payload before touching the DOM, so the widget is never
  half-patched. Carries a fallback copy of the URL that must track site.json.
- `staticwebapp.config.json` - the CSP `connect-src` must list the API origin.

**Changing the endpoint touches three files** (site.json, burn-status.js's
fallback literal, and the CSP `connect-src`). Only the first two are covered by
tests: `eleventy --serve` sends no `globalHeaders`, so the CSP is enforced only
on deployed Azure. Miss it and CI stays green while production shows "Live fire
status unavailable" on every load.

**Migration overlap (remove after ~2026-09):** `connect-src` currently lists both
`permits.stationworks.app` and the retired `api.permits.stationworks.app`. The
old host still serves an identical payload, so keeping it listed for one release
means reverting `burn_status_api` alone is a working rollback. Drop the old
origin once the new one has been stable in production.

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

## Azure Key Vault

Most secrets are centralized in Azure Key Vault `gh-website-utilities`. GitHub Actions use OIDC to authenticate and fetch secrets at runtime. GitHub-specific secrets (like deploy keys) are stored in GitHub Secrets instead.

### Pull secrets locally
```bash
./scripts/pull-secrets.sh           # Pull all secrets to .env
./scripts/pull-secrets.sh --list    # List available secrets
```

Requires Azure CLI login (`az login`).

### OIDC app registration
- App: `website-admin` (client ID in workflow files)
- Federated credentials:
  - `repo:sjifire/website:environment:production` (scheduled workflows)
  - `repo:sjifire/website:pull_request` (PR preview builds)
  - `repo:sjifire/website:ref:refs/heads/main` (manual triggers)
