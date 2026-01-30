#!/usr/bin/env node
/**
 * Sync personnel data from Microsoft 365
 *
 * Uses Entra ID user attributes:
 *   - employeeType: Determines staff vs volunteer (must be set to be included)
 *   - jobTitle: Display title
 *   - extensionAttribute1: Rank (Chief, Captain, Lieutenant, etc.)
 *   - extensionAttribute2: Apparatus Operator certification expiration date
 *   - extensionAttribute3: Comma-separated roles/certifications
 *
 * Secrets (environment variables):
 *   MS_GRAPH_TENANT_ID     - Azure AD tenant ID
 *   MS_GRAPH_CLIENT_ID     - App registration client ID
 *   MS_GRAPH_CLIENT_SECRET - App registration client secret
 *
 * CLI:
 *   npm run sync-personnel
 *   npm run sync-personnel -- --force-refresh
 *   npm run sync-personnel -- --hash-threshold=15
 */

import "dotenv/config";
import { writeFile, readFile, mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { MSGraphClient } from "./msgraph-client.mjs";
import { hashJpegBuffer, hammingDistance } from "./image-hash.mjs";
import { optimizeImageBuffer, getCloudinaryConfig } from "../api/src/lib/cloudinary.js";

// ============================================================================
// Configuration
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "..", "src", "_data", "personnel.json");
const PHOTOS_DIR = join(__dirname, "..", "src", "assets", "media", "personnel_imgs");
const PHOTO_HASHES_PATH = join(PHOTOS_DIR, ".photo-hashes.json");

const PHOTO_TRANSFORM = "w_1000,h_1000,c_fill,g_faces,q_auto";
const DEFAULT_HASH_THRESHOLD = 10;

// Employee types that map to "staff" (vs "volunteer")
const STAFF_EMPLOYEE_TYPES = [
  "Administrative",
  "Day Staff",
  "FT Line Staff",
  "PT Line Staff",
];

// Ranks in sort order (Chief first)
const RANKS = [
  "Chief",
  "Assistant Chief",
  "Battalion Chief",
  "Division Chief",
  "Captain",
  "Lieutenant",
];

// ============================================================================
// CLI Argument Parsing (using Node.js built-in util.parseArgs)
// ============================================================================

function getCliArgs() {
  const { values } = parseArgs({
    options: {
      "force-refresh": { type: "boolean", default: false },
      "hash-threshold": { type: "string", default: String(DEFAULT_HASH_THRESHOLD) },
    },
    strict: false,
  });

  return {
    forceRefresh: values["force-refresh"],
    hashThreshold: parseInt(values["hash-threshold"], 10),
  };
}

// ============================================================================
// Data Transformation Helpers
// ============================================================================

/**
 * Normalize name for filename: "John Doe" -> "john_doe"
 */
function normalizeFilename(firstName, lastName) {
  return `${firstName}_${lastName}`
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Determine employee category from employeeType attribute
 */
function determineEmployeeType(employeeType) {
  if (!employeeType) return null;
  if (STAFF_EMPLOYEE_TYPES.includes(employeeType)) return "staff";
  if (employeeType === "Volunteer") return "volunteer";
  return "volunteer"; // Unknown type defaults to volunteer
}

/**
 * Parse roles from extension attributes
 */
function determineRoles(extAttrs) {
  const roles = [];
  const rawRoles = extAttrs.extensionAttribute3 || "";
  const aoExpiration = extAttrs.extensionAttribute2 || "";

  const roleList = rawRoles.split(",").map(r => r.trim().toLowerCase());

  // Marine Crew (Mate or Pilot)
  if (roleList.includes("mate") || roleList.includes("pilot")) {
    roles.push("Marine Crew");
  }

  // Firefighter
  if (roleList.includes("firefighter")) {
    roles.push("Firefighter");
  }

  // Wildland Firefighter (only if not already a Firefighter)
  if (roleList.includes("wildland firefighter") && !roles.includes("Firefighter")) {
    roles.push("Wildland Firefighter");
  }

  // Support (only if not a Firefighter)
  if (roleList.includes("support") && !roles.includes("Firefighter")) {
    roles.push("Support");
  }

  // Apparatus Operator - check if certification date is in the future
  if (aoExpiration) {
    try {
      const expDate = new Date(aoExpiration);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (expDate > today) {
        roles.push("Apparatus Operator");
      }
    } catch {
      // Invalid date, skip
    }
  }

  return roles;
}

/**
 * Sort personnel: staff first (by rank, then name), volunteers (by rank, then name)
 */
function sortPersonnel(personnel) {
  return [...personnel].sort((a, b) => {
    // Staff before volunteers
    if (a.employee_type !== b.employee_type) {
      return a.employee_type === "staff" ? -1 : 1;
    }

    // Sort by rank (Chiefs first, then people without rank)
    const aRankIdx = a.rank ? RANKS.indexOf(a.rank) : 999;
    const bRankIdx = b.rank ? RANKS.indexOf(b.rank) : 999;
    if (aRankIdx !== bRankIdx) return aRankIdx - bRankIdx;

    // Then by first name
    return a.first_name.localeCompare(b.first_name);
  });
}

// ============================================================================
// Photo Hash Management
// ============================================================================

async function loadPhotoHashes() {
  try {
    const data = await readFile(PHOTO_HASHES_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function savePhotoHashes(hashes) {
  const sorted = Object.keys(hashes).sort().reduce((obj, key) => {
    obj[key] = hashes[key];
    return obj;
  }, {});
  await writeFile(PHOTO_HASHES_PATH, JSON.stringify(sorted, null, 2) + "\n");
}

// ============================================================================
// Microsoft Graph API
// ============================================================================

async function fetchUsersFromGraph(client) {
  const selectFields = [
    "id",
    "givenName",
    "surname",
    "displayName",
    "jobTitle",
    "employeeType",
    "onPremisesExtensionAttributes",
    "userPrincipalName",
  ];

  const response = await client.listUsers({
    filter: "userType eq 'Member'",
    select: selectFields,
  });

  return response.value || [];
}

// ============================================================================
// Photo Processing
// ============================================================================

async function processUserPhoto(client, user, filename, photoPath, existingHash, args) {
  const result = {
    photo: null,
    hash: null,
    status: null,
  };

  const photoExists = existsSync(photoPath);

  try {
    const photoData = await client.getUserPhoto(user.id);
    if (!photoData) {
      result.status = "no-photo";
      // Keep existing photo if we have one
      if (photoExists) {
        result.photo = `/assets/media/personnel_imgs/${filename}`;
        result.hash = existingHash;
      }
      return result;
    }

    // Convert Blob to Buffer if needed
    let rawBuffer;
    if (typeof photoData.arrayBuffer === "function") {
      const arrayBuffer = await photoData.arrayBuffer();
      rawBuffer = Buffer.from(arrayBuffer);
    } else {
      rawBuffer = Buffer.from(photoData);
    }

    const optimized = await optimizeImageBuffer(rawBuffer, { transform: PHOTO_TRANSFORM });
    const finalBuffer = optimized.buffer;
    const newHash = hashJpegBuffer(finalBuffer);

    // Determine if we should save
    let shouldSave = false;
    let reason = "";

    if (args.forceRefresh) {
      shouldSave = true;
      reason = "force refresh";
    } else if (!photoExists) {
      shouldSave = true;
      reason = "new";
    } else if (!existingHash) {
      // No stored hash, compare with existing file
      try {
        const existingData = await readFile(photoPath);
        const existingFileHash = hashJpegBuffer(existingData);
        const distance = hammingDistance(newHash, existingFileHash);
        if (distance > args.hashThreshold) {
          shouldSave = true;
          reason = `changed (d=${distance})`;
        } else {
          reason = `unchanged (d=${distance})`;
        }
      } catch {
        shouldSave = true;
        reason = "read error";
      }
    } else {
      const distance = hammingDistance(newHash, existingHash);
      if (distance > args.hashThreshold) {
        shouldSave = true;
        reason = `changed (d=${distance})`;
      } else {
        reason = `unchanged (d=${distance})`;
      }
    }

    if (shouldSave) {
      await writeFile(photoPath, finalBuffer);
      const sizeKB = Math.round(finalBuffer.length / 1024);
      const optStatus = optimized.optimized ? "cloudinary" : optimized.reason;
      result.status = { saved: true, reason, sizeKB, optStatus };
    } else {
      result.status = { saved: false, reason };
    }

    result.photo = `/assets/media/personnel_imgs/${filename}`;
    result.hash = newHash;
  } catch (error) {
    result.status = { error: error.message };
    // Keep existing photo if we have one
    if (photoExists) {
      result.photo = `/assets/media/personnel_imgs/${filename}`;
      result.hash = existingHash;
    }
  }

  return result;
}

// ============================================================================
// Photo Cleanup
// ============================================================================

async function cleanupOrphanedPhotos(currentPhotoFiles) {
  const existingPhotos = await readdir(PHOTOS_DIR);
  const removed = [];

  for (const file of existingPhotos) {
    // Skip non-jpg and placeholder images
    if (!file.endsWith(".jpg") || !file.includes("_")) continue;

    if (!currentPhotoFiles.has(file)) {
      await unlink(join(PHOTOS_DIR, file));
      removed.push(file);
    }
  }

  return removed;
}

// ============================================================================
// Output Generation
// ============================================================================

/**
 * Compute personnel counts for the key-information page
 */
function computeCounts(personnel) {
  const staff = personnel.filter(p => p.employee_type === "staff");
  const volunteers = personnel.filter(p => p.employee_type === "volunteer");

  // Firefighter roles include operational certifications (AO, Marine) that indicate FF status
  const hasFirefighterRole = (p) =>
    p.roles?.includes("Firefighter") ||
    p.roles?.includes("Wildland Firefighter") ||
    p.roles?.includes("Apparatus Operator") ||
    p.roles?.includes("Marine Crew");

  // Full-time: FT Line Staff, Day Staff, or Administrative with FF role
  const fullTimeTypes = ["FT Line Staff", "Day Staff", "Administrative"];
  const fullTimeFirefighters = staff.filter(
    p => fullTimeTypes.includes(p.staff_type) && hasFirefighterRole(p)
  ).length;

  // Part-time: PT Line Staff with FF role
  const partTimeFirefighters = staff.filter(
    p => p.staff_type === "PT Line Staff" && hasFirefighterRole(p)
  ).length;

  // Administrative: staff without FF role
  const administrativeStaff = staff.filter(p => !hasFirefighterRole(p)).length;

  // Volunteer firefighters: any firefighter role
  const volunteerFirefighters = volunteers.filter(p => hasFirefighterRole(p)).length;

  // Volunteer support: Support role but not a firefighter
  const volunteerSupport = volunteers.filter(
    p => p.roles?.includes("Support") && !hasFirefighterRole(p)
  ).length;

  return {
    fullTimeFirefighters,
    partTimeFirefighters,
    administrativeStaff,
    volunteerFirefighters,
    volunteerSupport,
  };
}

async function writePersonnelJson(personnel) {
  const counts = computeCounts(personnel);
  const output = {
    generated: new Date().toISOString(),
    count: personnel.length,
    counts,
    personnel: personnel,
  };
  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
}

function printSummary(personnel, photoStats, usersWithoutEmployeeType) {
  console.log("\nSummary:");
  console.log(`  Total personnel: ${personnel.length}`);
  console.log(`  Staff: ${personnel.filter(p => p.employee_type === "staff").length}`);
  console.log(`  Volunteers: ${personnel.filter(p => p.employee_type === "volunteer").length}`);
  console.log(`  With photos: ${personnel.filter(p => p.photo).length}`);

  // Role distribution
  const roleCounts = {};
  for (const p of personnel) {
    for (const r of p.roles) {
      roleCounts[r] = (roleCounts[r] || 0) + 1;
    }
  }
  console.log("\nRoles:");
  for (const [role, count] of Object.entries(roleCounts).sort()) {
    console.log(`  ${role}: ${count}`);
  }

  // Users without employeeType
  if (usersWithoutEmployeeType.length > 0) {
    console.log(`\nUsers without employeeType (not included) (${usersWithoutEmployeeType.length}):`);
    for (const user of usersWithoutEmployeeType.slice(0, 10)) {
      console.log(`  - ${user.name} <${user.email}>`);
    }
    if (usersWithoutEmployeeType.length > 10) {
      console.log(`  ... and ${usersWithoutEmployeeType.length - 10} more`);
    }
  }

  // Photo stats
  console.log("\nPhoto sync:");
  console.log(`  New photos downloaded: ${photoStats.downloaded}`);
  console.log(`  Photos updated (changed): ${photoStats.updated}`);
  console.log(`  Photos skipped (unchanged): ${photoStats.skippedUnchanged}`);
  console.log(`  No photo in M365: ${photoStats.skippedNoPhoto}`);

  console.log(`\nOutput written to ${OUTPUT_PATH}`);
  console.log("Done!");
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = getCliArgs();

  console.log("Personnel Sync from Microsoft 365 (Entra ID)");
  console.log("=============================================");

  // Validate environment
  const { MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET } = process.env;
  if (!MS_GRAPH_TENANT_ID || !MS_GRAPH_CLIENT_ID || !MS_GRAPH_CLIENT_SECRET) {
    console.error("Missing required environment variables:");
    if (!MS_GRAPH_TENANT_ID) console.error("  - MS_GRAPH_TENANT_ID");
    if (!MS_GRAPH_CLIENT_ID) console.error("  - MS_GRAPH_CLIENT_ID");
    if (!MS_GRAPH_CLIENT_SECRET) console.error("  - MS_GRAPH_CLIENT_SECRET");
    process.exit(1);
  }

  console.log(`Force refresh photos: ${args.forceRefresh}`);
  console.log(`Hash threshold: ${args.hashThreshold} bits`);

  const cloudinaryConfig = getCloudinaryConfig();
  if (!cloudinaryConfig) {
    console.warn("\nWarning: CLOUDINARY_API_KEY/SECRET not set - photos saved without optimization");
  }

  // Initialize Graph client and fetch users
  const client = new MSGraphClient({
    tenantId: MS_GRAPH_TENANT_ID,
    clientId: MS_GRAPH_CLIENT_ID,
    clientSecret: MS_GRAPH_CLIENT_SECRET,
  });

  console.log("\nFetching users from Microsoft 365...");
  const users = await fetchUsersFromGraph(client);
  console.log(`Found ${users.length} users`);

  // Ensure directories exist
  await mkdir(PHOTOS_DIR, { recursive: true });

  // Load existing photo hashes
  const photoHashes = await loadPhotoHashes();
  const newPhotoHashes = {};

  const photoStats = { downloaded: 0, skippedUnchanged: 0, skippedNoPhoto: 0, updated: 0 };
  const personnel = [];
  const usersWithoutEmployeeType = [];

  // Process each user
  for (const user of users) {
    if (!user.givenName || !user.surname) continue;

    const employeeType = determineEmployeeType(user.employeeType);
    if (!employeeType) {
      usersWithoutEmployeeType.push({
        name: `${user.givenName} ${user.surname}`,
        email: user.userPrincipalName,
      });
      continue;
    }

    const extAttrs = user.onPremisesExtensionAttributes || {};
    if (!extAttrs.extensionAttribute3?.trim()) {
      console.log(`  Skipping ${user.givenName} ${user.surname} (no positions)`);
      continue;
    }

    console.log(`  Processing ${user.givenName} ${user.surname} (${user.employeeType})...`);

    // Process photo
    const filename = `${normalizeFilename(user.givenName, user.surname)}.jpg`;
    const photoPath = join(PHOTOS_DIR, filename);
    const photoResult = await processUserPhoto(
      client, user, filename, photoPath, photoHashes[filename], args
    );

    // Update stats
    if (photoResult.status === "no-photo") {
      photoStats.skippedNoPhoto++;
      console.log("    No photo in M365");
    } else if (photoResult.status?.error) {
      photoStats.skippedNoPhoto++;
      console.log(`    No photo available: ${photoResult.status.error}`);
    } else if (photoResult.status?.saved) {
      if (photoResult.status.reason === "new") photoStats.downloaded++;
      else photoStats.updated++;
      console.log(`    Photo saved: ${photoResult.status.reason} (${photoResult.status.sizeKB}KB, ${photoResult.status.optStatus})`);
    } else {
      photoStats.skippedUnchanged++;
      console.log(`    Photo skipped: ${photoResult.status?.reason}`);
    }

    if (photoResult.hash) {
      newPhotoHashes[filename] = photoResult.hash;
    }

    // Build person object
    personnel.push({
      first_name: user.givenName,
      last_name: user.surname,
      rank: extAttrs.extensionAttribute1 || null,
      title: user.jobTitle || null,
      employee_type: employeeType,
      staff_type: user.employeeType,
      roles: determineRoles(extAttrs).sort(),
      photo: photoResult.photo,
    });
  }

  // Save photo hashes and cleanup orphans
  await savePhotoHashes(newPhotoHashes);
  const removedPhotos = await cleanupOrphanedPhotos(new Set(Object.keys(newPhotoHashes)));
  if (removedPhotos.length > 0) {
    console.log(`\nRemoved ${removedPhotos.length} photo(s) for deleted personnel:`);
    removedPhotos.forEach(f => console.log(`  - ${f}`));
  }

  // Sort and write output
  const sortedPersonnel = sortPersonnel(personnel);
  await writePersonnelJson(sortedPersonnel);

  printSummary(sortedPersonnel, photoStats, usersWithoutEmployeeType);
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
