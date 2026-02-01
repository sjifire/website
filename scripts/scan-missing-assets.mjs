#!/usr/bin/env node
/**
 * Scans website for missing assets (images, CSS, JS, etc.)
 * Uses Playwright to crawl all pages and detect 404 errors.
 *
 * Usage:
 *   node scripts/scan-missing-assets.mjs [baseUrl]
 *
 * Examples:
 *   node scripts/scan-missing-assets.mjs                    # Scan live site
 *   node scripts/scan-missing-assets.mjs http://localhost:8080  # Scan local dev
 */

import { chromium } from "@playwright/test";

const BASE_URL = process.argv[2] || "https://www.sjifire.org";
const visited = new Set();
const missingAssets = new Map(); // asset URL -> array of pages where it's referenced
const pagesToVisit = ["/"];

async function scanPage(page, path) {
  const url = new URL(path, BASE_URL).href;

  if (visited.has(url)) return;
  visited.add(url);

  console.log(`Scanning: ${path}`);

  const failedRequests = [];

  // Listen for failed requests
  const handleResponse = (response) => {
    const reqUrl = response.url();
    if (response.status() === 404 && reqUrl.startsWith(BASE_URL)) {
      failedRequests.push(reqUrl);
    }
  };

  page.on("response", handleResponse);

  try {
    const response = await page.goto(url, { waitUntil: "networkidle" });

    if (!response || response.status() === 404) {
      console.log(`  Page not found: ${path}`);
      return;
    }

    // Record any 404s found on this page
    for (const asset of failedRequests) {
      const assetPath = new URL(asset).pathname;
      if (!missingAssets.has(assetPath)) {
        missingAssets.set(assetPath, []);
      }
      missingAssets.get(assetPath).push(path);
      console.log(`  ❌ Missing: ${assetPath}`);
    }

    // Find all internal links to crawl
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a[href]"));
      return anchors
        .map((a) => a.getAttribute("href"))
        .filter((href) => {
          if (!href) return false;
          // Only internal links
          if (href.startsWith("http") && !href.includes(location.hostname))
            return false;
          // Skip anchors, mailto, tel, etc.
          if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:"))
            return false;
          // Skip file downloads (PDFs, etc.) - we still check images loaded on pages
          if (href.match(/\.(pdf|docx?|xlsx?|zip)$/i)) return false;
          return true;
        })
        .map((href) => {
          // Normalize to path
          try {
            return new URL(href, location.origin).pathname;
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    });

    // Add new links to visit
    for (const link of links) {
      const normalized = link.replace(/\/$/, "") || "/";
      if (!visited.has(new URL(normalized, BASE_URL).href)) {
        pagesToVisit.push(normalized);
      }
    }
  } catch (error) {
    console.log(`  Error loading page: ${error.message}`);
  } finally {
    page.off("response", handleResponse);
  }
}

async function main() {
  console.log(`\nScanning ${BASE_URL} for missing assets...\n`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    userAgent: "SJIFire-Asset-Scanner/1.0",
  });
  const page = await context.newPage();

  // Crawl all pages
  while (pagesToVisit.length > 0) {
    const path = pagesToVisit.shift();
    await scanPage(page, path);
  }

  await browser.close();

  // Report results
  console.log("\n" + "=".repeat(60));
  console.log("SCAN COMPLETE");
  console.log("=".repeat(60));
  console.log(`Pages scanned: ${visited.size}`);

  if (missingAssets.size === 0) {
    console.log("\n✅ No missing assets found!\n");
  } else {
    console.log(`\n❌ Found ${missingAssets.size} missing asset(s):\n`);

    // Sort by asset path for consistent output
    const sorted = [...missingAssets.entries()].sort((a, b) =>
      a[0].localeCompare(b[0])
    );

    for (const [asset, pages] of sorted) {
      console.log(`  ${asset}`);
      console.log(`    Referenced on:`);
      for (const page of pages) {
        console.log(`      - ${page}`);
      }
      console.log();
    }
  }
}

main().catch((error) => {
  console.error("Scan failed:", error);
  process.exit(1);
});
