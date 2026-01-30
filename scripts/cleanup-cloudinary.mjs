#!/usr/bin/env node
/**
 * Clean up old Cloudinary assets
 *
 * Removes resources that haven't been accessed in 30 days:
 * - Fetch resources: CDN-cached images from the site
 * - Upload resources: Temporary uploads from image optimization
 *
 * Uses the Cloudinary Node.js SDK.
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
import { parseArgs } from "node:util";
import { setTimeout } from "node:timers/promises";
import { createRequire } from "node:module";
import { v2 as cloudinary } from "cloudinary";

const require = createRequire(import.meta.url);
const siteConfig = require("../api/site-config.json");

// Extract cloud name from config
export const CLOUD_NAME = siteConfig.cloudinaryRootUrl.split("/").pop();
export const DEFAULT_MAX_AGE_DAYS = 30;
export const RESOURCE_TYPES = ["fetch", "upload"];
export const RATE_LIMIT_DELAY_MS = 200;

function configure() {
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error(
      "Missing CLOUDINARY_API_KEY or CLOUDINARY_API_SECRET environment variables"
    );
  }

  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: apiKey,
    api_secret: apiSecret,
  });
}

function getArgs() {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      days: { type: "string", default: String(DEFAULT_MAX_AGE_DAYS) },
    },
  });

  const maxAgeDays = parseInt(values.days, 10);
  if (isNaN(maxAgeDays) || maxAgeDays < 0) {
    throw new Error("--days must be a non-negative integer");
  }

  return { dryRun: values["dry-run"], maxAgeDays };
}

export function isOlderThan(dateString, maxAgeDays) {
  const date = new Date(dateString);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);
  return date < cutoff;
}

export function formatDate(dateString) {
  return new Date(dateString).toISOString().split("T")[0];
}

export function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

async function listResources(type, nextCursor = null) {
  const options = { type, max_results: 500, resource_type: "image" };
  if (nextCursor) {
    options.next_cursor = nextCursor;
  }
  return cloudinary.api.resources(options);
}

async function deleteResources(publicIds, type) {
  return cloudinary.api.delete_resources(publicIds, { type, resource_type: "image" });
}

async function deleteDerivedResources(derivedIds) {
  if (derivedIds.length === 0) return { deleted: {} };
  return cloudinary.api.delete_derived_resources(derivedIds);
}

async function main() {
  const { dryRun, maxAgeDays } = getArgs();
  configure();

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
      const result = await listResources(resourceType, nextCursor);
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
        await deleteDerivedResources(item.derivedIds);
        await setTimeout(RATE_LIMIT_DELAY_MS);
      }

      // Delete the main resource
      await deleteResources([item.publicId], item.type);
      deletedCount++;

      // Rate limit to stay within free plan API limits
      await setTimeout(RATE_LIMIT_DELAY_MS);

      if (deletedCount % 10 === 0) {
        console.log(`  Deleted ${deletedCount}/${staleList.length}...`);
      }
    } catch (error) {
      console.error(`  Failed to delete ${item.publicId}: ${error.message}`);
      // On rate limit errors, wait longer before continuing
      if (error.message.includes("420") || error.message.includes("Rate")) {
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

// Run only when executed directly (not when imported for testing)
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
