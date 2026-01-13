#!/usr/bin/env node
/**
 * Sync personnel data from Microsoft 365
 * Run: node scripts/sync-personnel.mjs
 *
 * Required environment variables:
 *   MS_GRAPH_TENANT_ID - Azure AD tenant ID
 *   MS_GRAPH_CLIENT_ID - App registration client ID
 *   MS_GRAPH_CLIENT_SECRET - App registration client secret
 *
 * Optional:
 *   MS_GRAPH_PERSONNEL_GROUP - Group ID/name for personnel (default: all users)
 *   MS_GRAPH_STAFF_GROUP - Comma-separated group IDs/names for staff members
 *   MS_GRAPH_VOLUNTEER_GROUP - Comma-separated group IDs/names for volunteers
 *   SYNC_PHOTOS - Set to "true" to download photos (default: true)
 *
 * CLI flags:
 *   --force-refresh  Force re-download all photos even if unchanged
 *   --hash-threshold=N  Hamming distance threshold for photo changes (default: 10)
 */

import 'dotenv/config';
import { writeFile, readFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MSGraphClient } from './msgraph-client.mjs';
import { hashJpegBuffer, hammingDistance } from './image-hash.mjs';
import { optimizeImageBuffer, getCloudinaryConfig } from './cloudinary-optimize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '..', 'src', 'pages', 'about', 'emergency-personnel-data.mdx');
const PHOTOS_DIR = join(__dirname, '..', 'src', 'assets', 'media', 'personnel_imgs');
const PHOTO_HASHES_PATH = join(__dirname, '..', 'src', 'assets', 'media', 'personnel_imgs', '.photo-hashes.json');

// Image processing settings via Cloudinary
// c_fill crops to exact dimensions, g_faces centers on detected faces
const PHOTO_TRANSFORM = 'w_1000,h_1000,c_limit,q_auto';
const DEFAULT_HASH_THRESHOLD = 10; // Hamming distance threshold for "same" image

// Role group mappings - M365 group display names to role names
// Configure these to match your M365 group names
const ROLE_GROUPS = {
  'FireFighters': 'FireFighter',
  'EMTs': 'EMT',
  'Apparatus Operators': 'Apparatus Operator',
  'Marine Crew': 'Marine Crew',
  'Support Staff': 'Support',
  'Wildland Firefighters': 'Wildland Firefighter',
};

// Rank mappings from jobTitle
const RANK_KEYWORDS = {
  'Chief': 'Chief',
  'Division Chief': 'Division Chief',
  'Captain': 'Captain',
  'Lieutenant': 'Lieutenant',
};

/**
 * Parse CLI arguments
 */
function parseArgs() {
  const args = {
    forceRefresh: false,
    hashThreshold: DEFAULT_HASH_THRESHOLD,
  };

  for (const arg of process.argv.slice(2)) {
    if (arg === '--force-refresh') {
      args.forceRefresh = true;
    } else if (arg.startsWith('--hash-threshold=')) {
      args.hashThreshold = parseInt(arg.split('=')[1], 10);
    }
  }

  return args;
}

/**
 * Load existing photo hashes
 */
async function loadPhotoHashes() {
  try {
    const data = await readFile(PHOTO_HASHES_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

/**
 * Save photo hashes
 */
async function savePhotoHashes(hashes) {
  await writeFile(PHOTO_HASHES_PATH, JSON.stringify(hashes, null, 2));
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
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/**
 * Extract rank from job title
 */
function extractRank(jobTitle) {
  if (!jobTitle) return null;

  // Check for specific ranks (order matters - check more specific first)
  for (const [keyword, rank] of Object.entries(RANK_KEYWORDS)) {
    if (jobTitle.toLowerCase().includes(keyword.toLowerCase())) {
      return rank;
    }
  }
  return null;
}

/**
 * Extract title (non-rank portion) from job title
 */
function extractTitle(jobTitle, rank) {
  if (!jobTitle) return null;
  if (!rank) return jobTitle;

  // Remove the rank from the title
  let title = jobTitle;
  for (const keyword of Object.keys(RANK_KEYWORDS)) {
    title = title.replace(new RegExp(keyword, 'gi'), '').trim();
  }

  // Clean up separators
  title = title.replace(/^[-–—,\s]+|[-–—,\s]+$/g, '').trim();

  return title || null;
}

/**
 * Determine roles from group memberships
 */
function determineRoles(userGroups) {
  const roles = [];

  for (const group of userGroups) {
    const groupName = group.displayName;
    for (const [groupPattern, roleName] of Object.entries(ROLE_GROUPS)) {
      if (groupName?.toLowerCase().includes(groupPattern.toLowerCase())) {
        if (!roles.includes(roleName)) {
          roles.push(roleName);
        }
      }
    }
  }

  return roles;
}

/**
 * Check if user is in a specific group
 */
function isInGroup(userGroups, targetGroupId) {
  return userGroups.some(g => g.id === targetGroupId || g.displayName === targetGroupId);
}

/**
 * Check if user is in any of the specified groups
 */
function isInAnyGroup(userGroups, targetGroupIds) {
  if (!targetGroupIds || targetGroupIds.length === 0) return false;
  return targetGroupIds.some(groupId => isInGroup(userGroups, groupId));
}

/**
 * Parse comma-separated group IDs from env var
 */
function parseGroupIds(envValue) {
  if (!envValue) return [];
  return envValue.split(',').map(id => id.trim()).filter(id => id.length > 0);
}

/**
 * Generate MDX frontmatter for personnel
 */
function generateMDX(personnel) {
  const yaml = [
    '---',
    'permalink: false',
    'tags: content-include',
    'contentFor: emergency-personnel',
    'title: Emergency Personnel',
    'personnel:',
  ];

  for (const person of personnel) {
    yaml.push(`  - first_name: ${person.first_name}`);
    yaml.push(`    last_name: ${person.last_name}`);

    if (person.rank) {
      yaml.push(`    rank: ${person.rank}`);
    }
    if (person.title) {
      yaml.push(`    title: ${person.title}`);
    }

    yaml.push(`    staff_type: ${person.staff_type}`);

    if (person.roles.length > 0) {
      yaml.push('    roles:');
      for (const role of person.roles) {
        yaml.push(`      - ${role}`);
      }
    }

    if (person.photo) {
      yaml.push(`    photo: ${person.photo}`);
    }
  }

  yaml.push('---');
  yaml.push('');

  return yaml.join('\n');
}

/**
 * Main execution
 */
async function main() {
  const args = parseArgs();

  console.log('Personnel Sync from Microsoft 365');
  console.log('==================================');

  // Validate environment
  const tenantId = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    console.error('Missing required environment variables:');
    if (!tenantId) console.error('  - MS_GRAPH_TENANT_ID');
    if (!clientId) console.error('  - MS_GRAPH_CLIENT_ID');
    if (!clientSecret) console.error('  - MS_GRAPH_CLIENT_SECRET');
    process.exit(1);
  }

  const personnelGroupId = process.env.MS_GRAPH_PERSONNEL_GROUP;
  const staffGroupIds = parseGroupIds(process.env.MS_GRAPH_STAFF_GROUP);
  const volunteerGroupIds = parseGroupIds(process.env.MS_GRAPH_VOLUNTEER_GROUP);
  const syncPhotos = process.env.SYNC_PHOTOS !== 'false';

  console.log(`Personnel group: ${personnelGroupId || '(all users)'}`);
  console.log(`Staff groups: ${staffGroupIds.length > 0 ? staffGroupIds.join(', ') : '(not configured)'}`);
  console.log(`Volunteer groups: ${volunteerGroupIds.length > 0 ? volunteerGroupIds.join(', ') : '(not configured)'}`);
  console.log(`Sync photos: ${syncPhotos}`);
  console.log(`Force refresh photos: ${args.forceRefresh}`);
  console.log(`Hash threshold: ${args.hashThreshold} bits`);

  // Check Cloudinary config
  const cloudinaryConfig = getCloudinaryConfig();
  if (syncPhotos && !cloudinaryConfig) {
    console.warn('\nWarning: CLOUDINARY_API_KEY/SECRET not set - photos will be saved without optimization');
  } else if (syncPhotos) {
    console.log(`Cloudinary transform: ${PHOTO_TRANSFORM}`);
  }

  // Initialize client
  const client = new MSGraphClient({ tenantId, clientId, clientSecret });

  // Fetch users
  console.log('\nFetching users from Microsoft 365...');

  let users = [];
  const selectFields = ['id', 'givenName', 'surname', 'displayName', 'jobTitle', 'mail', 'userPrincipalName'];

  if (personnelGroupId) {
    // Fetch from specific group
    const response = await client.getGroupMembers(personnelGroupId, selectFields);
    users = response.value || [];
  } else {
    // Fetch all users (filter out guests and system accounts)
    const response = await client.listUsers({
      filter: "userType eq 'Member'",
      select: selectFields,
    });
    users = response.value || [];
  }

  console.log(`Found ${users.length} users`);

  // Ensure photos directory exists
  if (syncPhotos) {
    await mkdir(PHOTOS_DIR, { recursive: true });
  }

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

  for (const user of users) {
    // Skip users without names
    if (!user.givenName || !user.surname) {
      console.log(`  Skipping ${user.displayName || user.userPrincipalName} (missing name)`);
      continue;
    }

    console.log(`  Processing ${user.givenName} ${user.surname}...`);

    // Get user's group memberships for roles and staff type
    const groupsResponse = await client.getUserGroups(user.id);
    const userGroups = groupsResponse.value || [];

    // Determine staff type
    let staffType = 'volunteer'; // Default to volunteer
    if (isInAnyGroup(userGroups, staffGroupIds)) {
      staffType = 'staff';
    } else if (isInAnyGroup(userGroups, volunteerGroupIds)) {
      staffType = 'volunteer';
    }

    // Extract rank and title from jobTitle
    const rank = extractRank(user.jobTitle);
    const title = extractTitle(user.jobTitle, rank);

    // Determine roles from groups
    const roles = determineRoles(userGroups);

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

    // Download photo if enabled
    if (syncPhotos) {
      const filename = `${normalizeFilename(user.givenName, user.surname)}.jpg`;
      const photoPath = join(PHOTOS_DIR, filename);
      const photoUrl = `/assets/media/personnel_imgs/${filename}`;
      const existingHash = photoHashes[filename];
      const photoExists = await fileExists(photoPath);

      try {
        const photoData = await client.getUserPhoto(user.id);
        if (photoData) {
          // Optimize image via Cloudinary (or use raw if no credentials)
          const rawBuffer = Buffer.from(photoData);
          const optimized = await optimizeImageBuffer(rawBuffer, { transform: PHOTO_TRANSFORM });

          const finalBuffer = optimized.buffer;
          const newHash = hashJpegBuffer(finalBuffer);

          // Check if we should save the photo
          let shouldSave = false;
          let reason = '';

          if (args.forceRefresh) {
            shouldSave = true;
            reason = 'force refresh';
          } else if (!photoExists) {
            shouldSave = true;
            reason = 'new photo';
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
              reason = 'could not read existing';
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
            const optStatus = optimized.optimized ? 'cloudinary' : optimized.reason;
            console.log(`    Photo saved: ${reason} (${sizeKB}KB, ${optStatus})`);
          } else {
            console.log(`    Photo skipped: ${reason}`);
          }

          // Store the new hash
          newPhotoHashes[filename] = newHash;
          person.photo = photoUrl;
        } else {
          photoStats.skippedNoPhoto++;
          console.log(`    No photo in M365`);

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
    }

    personnel.push(person);
  }

  // Save updated photo hashes
  if (syncPhotos) {
    await savePhotoHashes(newPhotoHashes);
  }

  // Sort: staff first (by rank), then volunteers (by last name)
  const rankOrder = ['Chief', 'Division Chief', 'Captain', 'Lieutenant'];
  personnel.sort((a, b) => {
    // Staff before volunteers
    if (a.staff_type !== b.staff_type) {
      return a.staff_type === 'staff' ? -1 : 1;
    }

    // Within staff, sort by rank
    if (a.staff_type === 'staff') {
      const aRankIdx = rankOrder.indexOf(a.rank) >= 0 ? rankOrder.indexOf(a.rank) : 999;
      const bRankIdx = rankOrder.indexOf(b.rank) >= 0 ? rankOrder.indexOf(b.rank) : 999;
      if (aRankIdx !== bRankIdx) return aRankIdx - bRankIdx;
    }

    // Then by last name
    return a.last_name.localeCompare(b.last_name);
  });

  // Generate output
  console.log(`\nGenerating personnel data file...`);
  const mdxContent = generateMDX(personnel);
  await writeFile(OUTPUT_PATH, mdxContent);

  console.log(`\nSummary:`);
  console.log(`  Total personnel: ${personnel.length}`);
  console.log(`  Staff: ${personnel.filter(p => p.staff_type === 'staff').length}`);
  console.log(`  Volunteers: ${personnel.filter(p => p.staff_type === 'volunteer').length}`);
  console.log(`  With photos: ${personnel.filter(p => p.photo).length}`);

  if (syncPhotos) {
    console.log(`\nPhoto sync:`);
    console.log(`  New photos downloaded: ${photoStats.downloaded}`);
    console.log(`  Photos updated (changed): ${photoStats.updated}`);
    console.log(`  Photos skipped (unchanged): ${photoStats.skippedUnchanged}`);
    console.log(`  No photo in M365: ${photoStats.skippedNoPhoto}`);
  }

  console.log(`\nOutput written to ${OUTPUT_PATH}`);
  console.log('Done!');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
