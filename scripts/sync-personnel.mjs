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
import { writeFile, readFile, mkdir, access, readdir, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MSGraphClient } from "./msgraph-client.mjs";
import { hashJpegBuffer, hammingDistance } from "./image-hash.mjs";
import { optimizeImageBuffer, getCloudinaryConfig } from "../api/src/lib/cloudinary.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "..", "src", "pages", "about", "our-team-data.mdx");
const PHOTOS_DIR = join(__dirname, "..", "src", "assets", "media", "personnel_imgs");
const PHOTO_HASHES_PATH = join(__dirname, "..", "src", "assets", "media", "personnel_imgs", ".photo-hashes.json");

// Cloudinary transform: 1000x1000 crop centered on face
const PHOTO_TRANSFORM = "w_1000,h_1000,c_fill,g_faces,q_auto";
const DEFAULT_HASH_THRESHOLD = 10;

// Employee types that map to "staff" (vs "volunteer")
const STAFF_EMPLOYEE_TYPES = [
  "Administrative",
  "Day Staff",
  "FT Line Staff",
  "PT Line Staff",
];

// Ranks in sort order (Chief first). Used for sorting personnel.
const RANKS = [
  "Chief",
  "Assistant Chief",
  "Battalion Chief",
  "Division Chief",
  "Captain",
  "Lieutenant",
];

/**
 * Parse CLI arguments
 */
function parseArgs() {
  const args = {
    forceRefresh: false,
    hashThreshold: DEFAULT_HASH_THRESHOLD,
  };

  for (const arg of process.argv.slice(2)) {
    if (arg === "--force-refresh") {
      args.forceRefresh = true;
    } else if (arg.startsWith("--hash-threshold=")) {
      args.hashThreshold = parseInt(arg.split("=")[1], 10);
    }
  }

  return args;
}

/**
 * Load existing photo hashes
 */
async function loadPhotoHashes() {
  try {
    const data = await readFile(PHOTO_HASHES_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

/**
 * Save photo hashes (sorted by filename for stable git diffs)
 */
async function savePhotoHashes(hashes) {
  const sorted = Object.keys(hashes).sort().reduce((obj, key) => {
    obj[key] = hashes[key];
    return obj;
  }, {});
  await writeFile(PHOTO_HASHES_PATH, JSON.stringify(sorted, null, 2) + "\n");
}

/**
 * Check if a file exists
 */
async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalize name for filename
 */
function normalizeFilename(firstName, lastName) {
  return `${firstName}_${lastName}`
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Determine staff type from employeeType attribute
 */
function determineStaffType(employeeType) {
  if (!employeeType) return null;
  if (STAFF_EMPLOYEE_TYPES.includes(employeeType)) return "staff";
  if (employeeType === "Volunteer") return "volunteer";
  // Unknown type - include as volunteer
  return "volunteer";
}

/**
 * Parse roles from extensionAttribute3 and determine simplified display roles
 * Also checks extensionAttribute2 for Apparatus Operator certification
 */
function determineRoles(extAttrs) {
  const roles = [];
  const rawRoles = extAttrs.extensionAttribute3 || "";
  const aoExpiration = extAttrs.extensionAttribute2 || "";

  // Parse comma-separated roles
  const roleList = rawRoles.split(",").map(r => r.trim().toLowerCase());

  // Marine Crew (Mate or Pilot)
  if (roleList.includes("mate") || roleList.includes("pilot")) {
    roles.push("Marine Crew");
  }

  // Firefighter
  if (roleList.includes("firefighter")) {
    roles.push("Firefighter");
  }

  // Wildland Firefighter (only if not already a Firefighter to avoid redundancy)
  if (roleList.includes("wildland firefighter") && !roles.includes("Firefighter")) {
    roles.push("Wildland Firefighter");
  }

  // Support
  if (roleList.includes("support")) {
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
 * Generate MDX frontmatter for personnel
 */
function generateMDX(personnel) {
  const yaml = [
    "---",
    "permalink: false",
    "tags: content-include",
    "contentFor: our-team",
    "title: Our Team",
    "intro: Our department is made up of dedicated career staff and volunteers who live and work in our island community.",
    "personnel:",
  ];

  for (const person of personnel) {
    yaml.push(`  - first_name: ${person.first_name}`);
    yaml.push(`    last_name: ${person.last_name}`);

    if (person.title) {
      yaml.push(`    title: ${person.title}`);
    }
    if (person.rank) {
      yaml.push(`    rank: ${person.rank}`);
    }

    yaml.push(`    staff_type: ${person.staff_type}`);

    if (person.roles.length > 0) {
      yaml.push("    roles:");
      for (const role of [...person.roles].sort()) {
        yaml.push(`      - ${role}`);
      }
    }

    if (person.photo) {
      yaml.push(`    photo: ${person.photo}`);
    }
  }

  yaml.push("---");
  yaml.push("");

  return yaml.join("\n");
}

/**
 * Main execution
 */
async function main() {
  const args = parseArgs();

  console.log("Personnel Sync from Microsoft 365 (Entra ID)");
  console.log("=============================================");

  // Validate environment
  const tenantId = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    console.error("Missing required environment variables:");
    if (!tenantId) console.error("  - MS_GRAPH_TENANT_ID");
    if (!clientId) console.error("  - MS_GRAPH_CLIENT_ID");
    if (!clientSecret) console.error("  - MS_GRAPH_CLIENT_SECRET");
    process.exit(1);
  }

  console.log(`Force refresh photos: ${args.forceRefresh}`);
  console.log(`Hash threshold: ${args.hashThreshold} bits`);

  // Check Cloudinary config
  const cloudinaryConfig = getCloudinaryConfig();
  if (!cloudinaryConfig) {
    console.warn("\nWarning: CLOUDINARY_API_KEY/SECRET not set - photos will be saved without optimization");
  } else {
    console.log(`Cloudinary transform: ${PHOTO_TRANSFORM}`);
  }

  // Initialize client
  const client = new MSGraphClient({ tenantId, clientId, clientSecret });

  // Fetch users with Entra ID attributes
  console.log("\nFetching users from Microsoft 365...");

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

  const users = response.value || [];
  console.log(`Found ${users.length} users`);

  // Ensure photos directory exists
  await mkdir(PHOTOS_DIR, { recursive: true });

  // Load existing photo hashes
  const photoHashes = await loadPhotoHashes();
  const newPhotoHashes = {};

  // Photo sync stats
  const photoStats = {
    downloaded: 0,
    skippedUnchanged: 0,
    skippedNoPhoto: 0,
    updated: 0,
  };

  // Process each user
  const personnel = [];
  const usersWithoutEmployeeType = [];

  for (const user of users) {
    // Skip users without names
    if (!user.givenName || !user.surname) {
      console.log(`  Skipping ${user.displayName || user.id} (missing name)`);
      continue;
    }

    // Determine staff type from employeeType
    const staffType = determineStaffType(user.employeeType);

    // Skip users without employeeType
    if (!staffType) {
      usersWithoutEmployeeType.push({
        name: `${user.givenName} ${user.surname}`,
        email: user.userPrincipalName,
        jobTitle: user.jobTitle || "(none)",
      });
      continue;
    }

    // Get extension attributes
    const extAttrs = user.onPremisesExtensionAttributes || {};

    // Skip users without positions (extensionAttribute3)
    const rawPositions = extAttrs.extensionAttribute3 || "";
    if (!rawPositions.trim()) {
      console.log(`  Skipping ${user.givenName} ${user.surname} (no positions)`);
      continue;
    }

    console.log(`  Processing ${user.givenName} ${user.surname} (${user.employeeType})...`);

    // Get rank from extensionAttribute1
    const rank = extAttrs.extensionAttribute1 || null;

    // Get title from jobTitle
    const title = user.jobTitle || null;

    // Determine roles from extension attributes
    const roles = determineRoles(extAttrs);

    // Build person object
    const person = {
      first_name: user.givenName,
      last_name: user.surname,
      rank,
      title,
      staff_type: staffType,
      roles,
      photo: null,
    };

    // Download photo
    const filename = `${normalizeFilename(user.givenName, user.surname)}.jpg`;
    const photoPath = join(PHOTOS_DIR, filename);
    const photoUrl = `/assets/media/personnel_imgs/${filename}`;
    const existingHash = photoHashes[filename];
    const photoExists = await fileExists(photoPath);

    try {
      const photoData = await client.getUserPhoto(user.id);
      if (photoData) {
        // Convert Blob to Buffer if needed (newer Graph SDK returns Blob)
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

        // Check if we should save the photo
        let shouldSave = false;
        let reason = "";

        if (args.forceRefresh) {
          shouldSave = true;
          reason = "force refresh";
        } else if (!photoExists) {
          shouldSave = true;
          reason = "new photo";
          photoStats.downloaded++;
        } else if (!existingHash) {
          // No stored hash, compute from existing file and compare
          try {
            const existingData = await readFile(photoPath);
            const existingFileHash = hashJpegBuffer(existingData);
            const distance = hammingDistance(newHash, existingFileHash);

            if (distance > args.hashThreshold) {
              shouldSave = true;
              reason = `changed (distance: ${distance})`;
              photoStats.updated++;
            } else {
              reason = `unchanged (distance: ${distance})`;
              photoStats.skippedUnchanged++;
            }
          } catch {
            shouldSave = true;
            reason = "could not read existing";
          }
        } else {
          // Compare with stored hash
          const distance = hammingDistance(newHash, existingHash);
          if (distance > args.hashThreshold) {
            shouldSave = true;
            reason = `changed (distance: ${distance})`;
            photoStats.updated++;
          } else {
            reason = `unchanged (distance: ${distance})`;
            photoStats.skippedUnchanged++;
          }
        }

        if (shouldSave) {
          await writeFile(photoPath, finalBuffer);
          const sizeKB = Math.round(finalBuffer.length / 1024);
          const optStatus = optimized.optimized ? "cloudinary" : optimized.reason;
          console.log(`    Photo saved: ${reason} (${sizeKB}KB, ${optStatus})`);
        } else {
          console.log(`    Photo skipped: ${reason}`);
        }

        // Store the new hash
        newPhotoHashes[filename] = newHash;
        person.photo = photoUrl;
      } else {
        photoStats.skippedNoPhoto++;
        console.log("    No photo in M365");

        // Keep existing photo if we have one
        if (photoExists) {
          person.photo = photoUrl;
          // Preserve the existing hash
          if (existingHash) {
            newPhotoHashes[filename] = existingHash;
          }
        }
      }
    } catch (error) {
      photoStats.skippedNoPhoto++;
      console.log(`    No photo available: ${error.message}`);

      // Keep existing photo if we have one
      if (photoExists) {
        person.photo = photoUrl;
        if (existingHash) {
          newPhotoHashes[filename] = existingHash;
        }
      }
    }

    personnel.push(person);
  }

  // Save updated photo hashes
  await savePhotoHashes(newPhotoHashes);

  // Clean up photos for removed personnel
  const existingPhotos = await readdir(PHOTOS_DIR);
  const currentPhotoFiles = new Set(Object.keys(newPhotoHashes));
  const removedPhotos = [];

  for (const file of existingPhotos) {
    // Skip non-jpg files
    if (!file.endsWith(".jpg")) continue;

    // Skip placeholder images (personnel photos have firstname_lastname.jpg format)
    if (!file.includes("_")) continue;

    if (!currentPhotoFiles.has(file)) {
      const photoPath = join(PHOTOS_DIR, file);
      await unlink(photoPath);
      removedPhotos.push(file);
    }
  }

  if (removedPhotos.length > 0) {
    console.log(`\nRemoved ${removedPhotos.length} photo(s) for deleted personnel:`);
    for (const file of removedPhotos) {
      console.log(`  - ${file}`);
    }
  }

  // Sort: staff first (by rank, then name), then volunteers (by rank, then name)
  personnel.sort((a, b) => {
    // Staff before volunteers
    if (a.staff_type !== b.staff_type) {
      return a.staff_type === "staff" ? -1 : 1;
    }

    // Sort by rank (Chiefs first)
    const aRankIdx = a.rank ? RANKS.indexOf(a.rank) : 999;
    const bRankIdx = b.rank ? RANKS.indexOf(b.rank) : 999;
    if (aRankIdx !== bRankIdx) return aRankIdx - bRankIdx;

    // Then by last name, first name as tiebreaker
    const lastNameCmp = a.last_name.localeCompare(b.last_name);
    if (lastNameCmp !== 0) return lastNameCmp;
    return a.first_name.localeCompare(b.first_name);
  });

  // Generate output
  console.log("\nGenerating personnel data file...");
  const mdxContent = generateMDX(personnel);
  await writeFile(OUTPUT_PATH, mdxContent);

  console.log("\nSummary:");
  console.log(`  Total personnel: ${personnel.length}`);
  console.log(`  Staff: ${personnel.filter(p => p.staff_type === "staff").length}`);
  console.log(`  Volunteers: ${personnel.filter(p => p.staff_type === "volunteer").length}`);
  console.log(`  With photos: ${personnel.filter(p => p.photo).length}`);

  // Show role distribution
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

  // List users who don't have an employeeType set
  if (usersWithoutEmployeeType.length > 0) {
    console.log(`\nUsers without employeeType (not included) (${usersWithoutEmployeeType.length}):`);
    for (const user of usersWithoutEmployeeType.slice(0, 10)) {
      console.log(`  - ${user.name} <${user.email}>`);
    }
    if (usersWithoutEmployeeType.length > 10) {
      console.log(`  ... and ${usersWithoutEmployeeType.length - 10} more`);
    }
  }

  console.log("\nPhoto sync:");
  console.log(`  New photos downloaded: ${photoStats.downloaded}`);
  console.log(`  Photos updated (changed): ${photoStats.updated}`);
  console.log(`  Photos skipped (unchanged): ${photoStats.skippedUnchanged}`);
  console.log(`  No photo in M365: ${photoStats.skippedNoPhoto}`);

  console.log(`\nOutput written to ${OUTPUT_PATH}`);
  console.log("Done!");
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
