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

Requires Node.js 22+. Output goes to `_site/`.

## Architecture

### Directory Structure

- `src/_data/` - Global data: site config (`site.json`), page data (`.yml`), dynamic loaders (`posts.js`, `media_releases.js`)
- `src/_includes/` - Nunjucks templates: `base.njk` (root layout), `default_single_col_page.njk`/`default_double_col_page.njk` (page layouts), widgets, header/footer
- `src/pages/` - Content pages (`.njk`/`.md`) - URLs generated without `/pages/` prefix via `pages.11tydata.js`
- `src/posts/` - News posts as JSON files (`YYYY-MM-DD-slug.json`)
- `src/media_releases/` - Press release metadata (JSON) linking to PDFs in `src/assets/media_releases/`
- `src/modules/` - Utility JS: ESO incident scraper, board meeting date calculator
- `api/` - Azure Functions backend (TypeScript) for GitHub content operations and auth

### Key Patterns

**Template inheritance**: `base.njk` → layout templates → page templates. Pages auto-select layout based on sidebar presence in YAML frontmatter.

**Content types**: Pages use YAML data files in `_data/` (e.g., `homepage.yml`). Posts and media releases are JSON files loaded by dynamic data files (`posts.js`, `media_releases.js`).

**Date handling**: All dates use Luxon with explicit UTC timezone to avoid DST issues. Multiple date filters exist for different formats (`postDateTerseISO`, `postDateVerboseISO`, etc.).

**Image optimization**: Production builds use Cloudinary via `imgPath` shortcode. Set `enable_cloudinary_rewrites` in `site.json`.

### Configuration Files

- `.eleventy.js` - 11ty config with custom Nunjucks filters, passthrough copies, RSS plugin
- `.tina/config.ts` - TinaCMS schema and media configuration
- `staticwebapp.config.json` - Azure routing, auth (requires AAD tenant ID), CSP headers

### Authentication

Admin routes (`/admin/*`, `/api/*`) require Azure AD authentication configured via `staticwebapp.config.json`. See README.md for Azure AD setup.
