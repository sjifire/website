#!/usr/bin/env node
/**
 * Clean up old Cloudinary assets
 *
 * Removes resources that haven't been accessed in 30 days:
 * - Fetch resources: CDN-cached images from the site
 * - Upload resources: Temporary uploads from image optimization
 *
 * Uses the Cloudinary Admin API to list and delete stale resources.
 *
 * Usage:
 *   node scripts/cleanup-cloudinary.mjs [--dry-run] [--days=30]
 *
 * Options:
 *   --dry-run   Show what would be deleted without actually deleting
 *   --days=N    Delete resources not accessed in N days (default: 30)
 *
 * Required environment variables:
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 *
 * Note: This script is designed to work within Cloudinary's free plan API limits.
 * It uses conservative rate limiting between API calls.
 */

import "dotenv/config";
import { createRequire } from "node:module";
import { setTimeout } from "node:timers/promises";

const require = createRequire(import.meta.url);
const siteConfig = require("../api/site-config.json");

// Extract cloud name from config
const CLOUD_NAME = siteConfig.cloudinaryRootUrl.split("/").pop();
const DEFAULT_MAX_AGE_DAYS = 30;

function getConfig() {
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error(
      "Missing CLOUDINARY_API_KEY or CLOUDINARY_API_SECRET environment variables"
    );
  }

  return { apiKey, apiSecret, cloudName: CLOUD_NAME };
}

function parseArgs() {
  const args = process.argv.slice(2);
  let dryRun = false;
  let maxAgeDays = DEFAULT_MAX_AGE_DAYS;

  for (const arg of args) {
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg.startsWith("--days=")) {
      maxAgeDays = parseInt(arg.split("=")[1], 10);
      if (isNaN(maxAgeDays) || maxAgeDays < 0) {
        throw new Error("--days must be a non-negative integer");
      }
    }
  }

  return { dryRun, maxAgeDays };
}

async function cloudinaryRequest(config, endpoint, method = "GET", body = null) {
  const auth = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64");
  const url = `https://api.cloudinary.com/v1_1/${config.cloudName}${endpoint}`;

  const options = {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cloudinary API error (${response.status}): ${error}`);
  }

  return response.json();
}

// Resource types to clean up
const RESOURCE_TYPES = ["fetch", "upload"];

async function listResources(config, type, nextCursor = null) {
  let endpoint = `/resources/image/${type}?max_results=500`;
  if (nextCursor) {
    endpoint += `&next_cursor=${encodeURIComponent(nextCursor)}`;
  }

  return cloudinaryRequest(config, endpoint);
}

async function deleteResource(config, publicId, type) {
  // Delete a specific resource by public_id and type
  return cloudinaryRequest(config, `/resources/image/${type}`, "DELETE", {
    public_ids: [publicId],
  });
}

async function deleteDerivedResources(config, derivedIds) {
  // Delete derived resources by their IDs
  if (derivedIds.length === 0) return { deleted: {} };

  return cloudinaryRequest(config, "/derived_resources", "DELETE", {
    derived_resource_ids: derivedIds,
  });
}

function isOlderThan(dateString, maxAgeDays) {
  const date = new Date(dateString);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);
  return date < cutoff;
}

function formatDate(dateString) {
  return new Date(dateString).toISOString().split("T")[0];
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

// Rate limiting for free plan API limits
const RATE_LIMIT_DELAY_MS = 200;

async function main() {
  const { dryRun, maxAgeDays } = parseArgs();
  const config = getConfig();

  console.log(`Cloudinary Cleanup - ${CLOUD_NAME}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Max age: ${maxAgeDays} days`);
  console.log(`Resource types: ${RESOURCE_TYPES.join(", ")}`);
  console.log("=".repeat(50));

  let totalResources = 0;
  let staleResources = 0;
  let totalBytes = 0;
  let deletedCount = 0;
  const staleList = [];

  // Iterate through all resource types
  for (const resourceType of RESOURCE_TYPES) {
    let nextCursor = null;
    let typeCount = 0;

    console.log(`\n[${resourceType.toUpperCase()}] Scanning...`);

    do {
      const result = await listResources(config, resourceType, nextCursor);
      const resources = result.resources || [];
      nextCursor = result.next_cursor;

      typeCount += resources.length;
      totalResources += resources.length;

      // Rate limit between pagination requests
      if (nextCursor) {
        await setTimeout(RATE_LIMIT_DELAY_MS);
      }

      for (const resource of resources) {
        // Use created_at as proxy for last access if last_access not available
        // Cloudinary's fetch resources are recreated on access, so created_at
        // effectively represents last access for fetch-type resources
        const lastAccess = resource.last_access || resource.created_at;

        if (isOlderThan(lastAccess, maxAgeDays)) {
          staleResources++;
          totalBytes += resource.bytes || 0;
          staleList.push({
            publicId: resource.public_id,
            type: resourceType,
            lastAccess: formatDate(lastAccess),
            bytes: resource.bytes || 0,
            derivedIds: (resource.derived || []).map((d) => d.id),
          });
        }
      }
    } while (nextCursor);

    console.log(`  Found ${typeCount} resources`);
  }

  console.log("\n" + "=".repeat(50));
  console.log(`Total resources scanned: ${totalResources}`);
  console.log(`Stale resources (>${maxAgeDays} days): ${staleResources}`);
  console.log(`Total space to reclaim: ${formatBytes(totalBytes)}`);

  if (staleList.length === 0) {
    console.log("\nNo stale resources to clean up.");
    return;
  }

  console.log("\nStale resources:");
  for (const item of staleList.slice(0, 20)) {
    console.log(`  - ${item.publicId}`);
    console.log(`    Last access: ${item.lastAccess}, Size: ${formatBytes(item.bytes)}`);
  }
  if (staleList.length > 20) {
    console.log(`  ... and ${staleList.length - 20} more`);
  }

  if (dryRun) {
    console.log("\n[DRY RUN] No resources were deleted.");
    return;
  }

  // Delete stale resources
  console.log("\nDeleting stale resources...");

  for (const item of staleList) {
    try {
      // First delete derived resources if any
      if (item.derivedIds.length > 0) {
        await deleteDerivedResources(config, item.derivedIds);
        await setTimeout(RATE_LIMIT_DELAY_MS);
      }

      // Then delete the main resource
      await deleteResource(config, item.publicId, item.type);
      deletedCount++;

      // Rate limit to stay within free plan API limits
      await setTimeout(RATE_LIMIT_DELAY_MS);

      if (deletedCount % 10 === 0) {
        console.log(`  Deleted ${deletedCount}/${staleList.length}...`);
      }
    } catch (error) {
      console.error(`  Failed to delete ${item.publicId}: ${error.message}`);
      // On rate limit errors, wait longer before continuing
      if (error.message.includes("420") || error.message.includes("rate")) {
        console.log("  Rate limited, waiting 60 seconds...");
        await setTimeout(60000);
      }
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("Cleanup complete!");
  console.log(`Deleted: ${deletedCount} resources`);
  console.log(`Space reclaimed: ${formatBytes(totalBytes)}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
