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

Requires Node.js 20+. Output goes to `_site/`.

## Architecture

### Directory Structure

- `src/_data/` - Global data: site config (`site.json`), page data (`.yml`), dynamic loaders (`posts.js`, `media_releases.js`)
- `src/_includes/` - LiquidJS templates: `base.liquid` (root layout), `page.liquid` (page layout with sidebar support), widgets, header/footer
- `src/pages/` - Content pages (`.liquid`/`.md`/`.mdx`) - URLs generated without `/pages/` prefix via `pages.11tydata.js`
- `src/posts/` - News posts as JSON files (`YYYY-MM-DD-slug.json`)
- `src/media_releases/` - Press release metadata (JSON) linking to PDFs in `src/assets/media_releases/`
- `scripts/` - Standalone ESM scripts for data sync (NERIS, M365 personnel)
- `api/` - Azure Functions backend (TypeScript) for GitHub content operations and auth

### Key Patterns

**Template inheritance**: `base.liquid` → `page.liquid` → page templates. Pages use Eleventy's layout frontmatter (`layout: page` or `layout: base`). The `page.liquid` layout auto-selects two-column or single-column layout based on sidebar presence in frontmatter.

**Content types**: Pages use YAML data files in `_data/` (e.g., `homepage.yml`). Posts and media releases are JSON files loaded by dynamic data files (`posts.js`, `media_releases.js`).

**Date handling**: All dates use Luxon with explicit UTC timezone to avoid DST issues. Multiple date filters exist for different formats (`postDateTerseISO`, `postDateVerboseISO`, etc.).

**Image optimization**: Production builds use Cloudinary via `imgPath` shortcode. Set `enable_cloudinary_rewrites` in `site.json`.

### Configuration Files

- `.eleventy.js` - 11ty config with custom LiquidJS engine, filters (groupby, dictsort, cycler, round, slugify), shortcodes (imgPath), passthrough copies
- `.tina/config.ts` - TinaCMS schema and media configuration
- `staticwebapp.config.json` - Azure routing, auth (requires AAD tenant ID), CSP headers

### Authentication

Admin routes (`/admin/*`, `/api/*`) require Azure AD authentication configured via `staticwebapp.config.json`. See README.md for Azure AD setup.

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

Personnel data and photos are synced daily from Microsoft 365 via Microsoft Graph API.

**Files:**
- `scripts/msgraph-client.mjs` - ESM client for Microsoft Graph API
- `scripts/sync-personnel.mjs` - Syncs users/photos to `our-team-data.mdx`
- `scripts/image-hash.mjs` - Perceptual hashing for photo change detection
- `scripts/cloudinary-optimize.mjs` - Photo optimization via Cloudinary
- `.github/workflows/sync-personnel.yml` - Daily scheduled workflow (7 AM UTC)

**Required GitHub Secrets:**
- `MS_GRAPH_TENANT_ID` - Azure AD tenant ID
- `MS_GRAPH_CLIENT_ID` - App registration client ID
- `MS_GRAPH_CLIENT_SECRET` - App registration client secret
- `CLOUDINARY_API_KEY` - Cloudinary API key (for photo optimization)
- `CLOUDINARY_API_SECRET` - Cloudinary API secret

**Configuration in `src/_data/site.json`:**
```json
{
  "personnelSync": {
    "personnelGroup": "group-id",
    "staffGroups": ["group-id-1", "group-id-2"],
    "volunteerGroups": ["group-id-1", "group-id-2"],
    "roleGroups": {
      "group-id": "Role Name"
    },
    "syncPhotos": true
  }
}
```

**Azure AD App Setup:**
1. Create App Registration in Azure Portal
2. Add API Permission: Microsoft Graph → Application → `User.Read.All`, `GroupMember.Read.All`
3. Grant admin consent
4. Create client secret

**Local Testing:**
```bash
export MS_GRAPH_TENANT_ID="your-tenant-id"
export MS_GRAPH_CLIENT_ID="your-client-id"
export MS_GRAPH_CLIENT_SECRET="your-client-secret"
npm run sync-personnel
```
