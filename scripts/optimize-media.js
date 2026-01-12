#!/usr/bin/env node
/**
 * Optimize images in src/assets/media using Cloudinary
 * Uses the same logic as the admin upload flow
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Config from api/src/lib/cloudinary.js
const siteConfig = require("../api/site-config.json");
const CLOUD_NAME = siteConfig.cloudinaryRootUrl.split("/").pop();
const OPTIMIZABLE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"];
const MIN_SIZE_BYTES = 500 * 1024; // 500KB
const TRANSFORM = "w_2000,h_2000,c_limit,q_auto";

const MEDIA_DIR = path.join(__dirname, "../src/assets/media");

function getCloudinaryConfig() {
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!apiKey || !apiSecret) {
    return null;
  }

  return { apiKey, apiSecret, cloudName: CLOUD_NAME };
}

function isOptimizableFile(filename) {
  if (!filename) return false;
  const ext = filename.toLowerCase().split(".").pop();
  return OPTIMIZABLE_EXTENSIONS.includes(ext);
}

function generateSignature(params, apiSecret) {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return crypto
    .createHash("sha1")
    .update(sortedParams + apiSecret)
    .digest("hex");
}

async function optimizeImage(filePath, config) {
  const filename = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  const originalSizeBytes = fileBuffer.length;

  // Check file size - skip if already small
  if (originalSizeBytes < MIN_SIZE_BYTES) {
    return { optimized: false, reason: "already_small", originalSize: originalSizeBytes };
  }

  const base64Content = fileBuffer.toString("base64");

  // Determine mime type from extension
  const ext = filename.toLowerCase().split(".").pop();
  const mimeType = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/jpeg";

  // Create data URI for upload
  const dataUri = `data:${mimeType};base64,${base64Content}`;

  // Prepare signed upload params
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    timestamp,
    transformation: TRANSFORM,
  };

  const signature = generateSignature(params, config.apiSecret);

  // Build form data
  const formData = new FormData();
  formData.append("file", dataUri);
  formData.append("timestamp", timestamp.toString());
  formData.append("transformation", TRANSFORM);
  formData.append("signature", signature);
  formData.append("api_key", config.apiKey);

  // Upload to Cloudinary
  const uploadUrl = `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`;
  const response = await fetch(uploadUrl, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`  Upload failed for ${filename}:`, error);
    return { optimized: false, reason: "upload_failed", originalSize: originalSizeBytes };
  }

  const result = await response.json();

  // Fetch the optimized image
  const optimizedUrl = result.secure_url;
  const imageResponse = await fetch(optimizedUrl);

  if (!imageResponse.ok) {
    console.error(`  Failed to fetch optimized ${filename}`);
    return { optimized: false, reason: "fetch_failed", originalSize: originalSizeBytes };
  }

  const optimizedBuffer = Buffer.from(await imageResponse.arrayBuffer());
  const optimizedSizeBytes = optimizedBuffer.length;

  // Only use optimized if it's actually smaller
  if (optimizedSizeBytes >= originalSizeBytes) {
    return { optimized: false, reason: "not_smaller", originalSize: originalSizeBytes, optimizedSize: optimizedSizeBytes };
  }

  // Write optimized file
  fs.writeFileSync(filePath, optimizedBuffer);

  const savedBytes = originalSizeBytes - optimizedSizeBytes;
  const savedPercent = Math.round((savedBytes / originalSizeBytes) * 100);

  return {
    optimized: true,
    originalSize: originalSizeBytes,
    optimizedSize: optimizedSizeBytes,
    savedBytes,
    savedPercent,
  };
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

async function main() {
  const config = getCloudinaryConfig();
  if (!config) {
    console.error("Missing CLOUDINARY_API_KEY or CLOUDINARY_API_SECRET in environment");
    process.exit(1);
  }

  console.log(`Cloudinary cloud: ${config.cloudName}`);
  console.log(`Transform: ${TRANSFORM}`);
  console.log(`Min size threshold: ${formatBytes(MIN_SIZE_BYTES)}`);
  console.log(`Media directory: ${MEDIA_DIR}\n`);

  // Get all files recursively
  function getFiles(dir, files = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        getFiles(fullPath, files);
      } else if (isOptimizableFile(entry.name)) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const files = getFiles(MEDIA_DIR);
  console.log(`Found ${files.length} optimizable images\n`);

  let totalOriginal = 0;
  let totalOptimized = 0;
  let optimizedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const filePath of files) {
    const relativePath = path.relative(MEDIA_DIR, filePath);
    const fileSize = fs.statSync(filePath).size;

    if (fileSize < MIN_SIZE_BYTES) {
      console.log(`[SKIP] ${relativePath} (${formatBytes(fileSize)} < ${formatBytes(MIN_SIZE_BYTES)})`);
      skippedCount++;
      continue;
    }

    process.stdout.write(`[OPTIMIZING] ${relativePath} (${formatBytes(fileSize)})... `);

    try {
      const result = await optimizeImage(filePath, config);

      if (result.optimized) {
        console.log(`✓ ${formatBytes(result.originalSize)} → ${formatBytes(result.optimizedSize)} (saved ${result.savedPercent}%)`);
        totalOriginal += result.originalSize;
        totalOptimized += result.optimizedSize;
        optimizedCount++;
      } else {
        console.log(`- ${result.reason}`);
        if (result.reason === "not_smaller") {
          skippedCount++;
        } else {
          errorCount++;
        }
      }
    } catch (error) {
      console.log(`✗ Error: ${error.message}`);
      errorCount++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Summary:");
  console.log(`  Optimized: ${optimizedCount} files`);
  console.log(`  Skipped: ${skippedCount} files`);
  console.log(`  Errors: ${errorCount} files`);
  if (optimizedCount > 0) {
    const totalSaved = totalOriginal - totalOptimized;
    const totalSavedPercent = Math.round((totalSaved / totalOriginal) * 100);
    console.log(`  Space saved: ${formatBytes(totalSaved)} (${totalSavedPercent}%)`);
    console.log(`  Original total: ${formatBytes(totalOriginal)}`);
    console.log(`  Optimized total: ${formatBytes(totalOptimized)}`);
  }
}

main().catch(console.error);
