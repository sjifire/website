#!/usr/bin/env node
/**
 * Sync personnel data from Microsoft 365
 *
 * Secrets (environment variables):
 *   MS_GRAPH_TENANT_ID     - Azure AD tenant ID
 *   MS_GRAPH_CLIENT_ID     - App registration client ID
 *   MS_GRAPH_CLIENT_SECRET - App registration client secret
 *
 * Configuration (src/_data/site.json → personnelSync):
 *   personnelGroup   - Entra ID group containing personnel to sync
 *   staffGroups      - Group IDs that indicate staff (vs volunteer)
 *   volunteerGroups  - Group IDs that indicate volunteer
 *   roleGroups       - Map of group ID → role name (e.g., "Firefighter", "Marine Crew")
 *   syncPhotos       - Whether to sync profile photos (default: true)
 *
 * CLI:
 *   npm run sync-personnel
 *   npm run sync-personnel -- --force-refresh
 *   npm run sync-personnel -- --hash-threshold=15
 */

import 'dotenv/config';
import { writeFile, readFile, mkdir, access } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MSGraphClient } from './msgraph-client.mjs';
import { hashJpegBuffer, hammingDistance } from './image-hash.mjs';
import { optimizeImageBuffer, getCloudinaryConfig } from './cloudinary-optimize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_CONFIG_PATH = join(__dirname, '..', 'src', '_data', 'site.json');
const OUTPUT_PATH = join(__dirname, '..', 'src', 'pages', 'about', 'our-team-data.mdx');
const PHOTOS_DIR = join(__dirname, '..', 'src', 'assets', 'media', 'personnel_imgs');
const PHOTO_HASHES_PATH = join(__dirname, '..', 'src', 'assets', 'media', 'personnel_imgs', '.photo-hashes.json');

// Load site configuration
const siteConfig = JSON.parse(readFileSync(SITE_CONFIG_PATH, 'utf-8'));
const syncConfig = siteConfig.personnelSync || {};

// Cloudinary transform: 1000x1000 crop centered on face
const PHOTO_TRANSFORM = 'w_1000,h_1000,c_fill,g_faces,q_auto';
const DEFAULT_HASH_THRESHOLD = 10;

// Group ID → role name mapping from site.json
const roleGroups = syncConfig.roleGroups || {};

// Role superseding: if role X is present, hide roles in its array
const supersedeRoles = syncConfig.supersedeRoles || {};

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

// Ranks in sort order (Chief first). Used for sorting personnel.
const RANKS = [
  'Chief',
  'Assistant Chief',
  'Battalion Chief',
  'Division Chief',
  'Captain',
  'Lieutenant',
  'Apparatus Operator'
];

// Same ranks sorted by length (longest first) for parsing jobTitle without partial matches
const RANKS_BY_LENGTH = [...RANKS].sort((a, b) => b.length - a.length);

/**
 * Parse jobTitle into rank and title
 * "Captain - Training Officer" → { rank: "Captain", title: "Training Officer" }
 */
function parseJobTitle(jobTitle) {
  if (!jobTitle) return { rank: null, title: null };

  let rank = null;
  let title = jobTitle;

  // Find matching rank (check longer ranks first to avoid partial matches)
  for (const r of RANKS_BY_LENGTH) {
    if (jobTitle.toLowerCase().includes(r.toLowerCase())) {
      rank = r;
      // Remove rank from title
      title = jobTitle.replace(new RegExp(r, 'i'), '');
      break;
    }
  }

  // Clean up separators: leading/trailing spaces, dashes, colons, underscores, commas
  title = title.replace(/^[\s\-:_,]+|[\s\-:_,]+$/g, '').trim();

  return {
    rank,
    title: title || null,
  };
}

/**
 * Map user's group memberships to roles via roleGroups config
 * Applies supersedeRoles: if role X is present, roles it supersedes are hidden
 */
function determineRoles(userGroups) {
  const roles = [];
  for (const group of userGroups) {
    const role = roleGroups[group.id];
    if (role && !roles.includes(role)) {
      roles.push(role);
    }
  }

  // Remove roles that are superseded by other roles present
  const superseded = new Set();
  for (const role of roles) {
    const hides = supersedeRoles[role];
    if (hides) {
      for (const hidden of hides) {
        superseded.add(hidden);
      }
    }
  }

  return roles.filter(role => !superseded.has(role));
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
 * Parse comma-separated group IDs (for env var backwards compatibility)
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
    'contentFor: our-team',
    'title: Our Team',
    'intro: Our department is made up of dedicated career staff and volunteers who live and work in our island community.',
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

  // Get config from site.json (env vars override for backwards compatibility)
  const personnelGroupId = process.env.MS_GRAPH_PERSONNEL_GROUP || syncConfig.personnelGroup;
  const staffGroupIds = process.env.MS_GRAPH_STAFF_GROUP
    ? parseGroupIds(process.env.MS_GRAPH_STAFF_GROUP)
    : (syncConfig.staffGroups || []);
  const volunteerGroupIds = process.env.MS_GRAPH_VOLUNTEER_GROUP
    ? parseGroupIds(process.env.MS_GRAPH_VOLUNTEER_GROUP)
    : (syncConfig.volunteerGroups || []);
  const syncPhotos = process.env.SYNC_PHOTOS !== undefined
    ? process.env.SYNC_PHOTOS !== 'false'
    : (syncConfig.syncPhotos !== false);

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
  const selectFields = ['id', 'givenName', 'surname', 'displayName', 'jobTitle'];

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
      console.log(`  Skipping ${user.displayName || user.id} (missing name)`);
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

    // Determine roles from groups
    const roles = determineRoles(userGroups);

    // Parse jobTitle into rank and title
    const { rank, title } = parseJobTitle(user.jobTitle);

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
  personnel.sort((a, b) => {
    // Staff before volunteers
    if (a.staff_type !== b.staff_type) {
      return a.staff_type === 'staff' ? -1 : 1;
    }

    // Within staff, sort by rank
    if (a.staff_type === 'staff') {
      const aRankIdx = a.rank ? RANKS.indexOf(a.rank) : 999;
      const bRankIdx = b.rank ? RANKS.indexOf(b.rank) : 999;
      if (aRankIdx !== bRankIdx) return aRankIdx - bRankIdx;
    }

    // Then by first name
    return a.first_name.localeCompare(b.first_name);
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
