#!/usr/bin/env node
/**
 * Add a text watermark to images via Cloudinary
 *
 * Usage:
 *   node scripts/watermark-image.mjs --credit "Photographer Name" image1.jpg [image2.jpg ...]
 *
 * The watermark "© Name" is rendered in the lower-left corner of each image
 * with a semi-transparent dark background for readability.
 */

import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, extname, basename } from "node:path";
import {
  getCloudinaryConfig,
  generateSignature,
  CLOUD_NAME,
  TRANSFORM,
} from "../api/src/lib/cloudinary.js";

function parseArgs(argv) {
  const args = argv.slice(2);
  let credit = null;
  const files = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--credit" && i + 1 < args.length) {
      credit = args[++i];
    } else {
      files.push(resolve(args[i]));
    }
  }

  if (!credit || files.length === 0) {
    console.error("Usage: node scripts/watermark-image.mjs --credit \"Name\" image1.jpg [image2.jpg ...]");
    process.exit(1);
  }

  return { credit, files };
}

async function uploadToCloudinary(dataUri, config) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { timestamp };
  const signature = generateSignature(params, config.apiSecret);

  const formData = new FormData();
  formData.append("file", dataUri);
  formData.append("timestamp", timestamp.toString());
  formData.append("signature", signature);
  formData.append("api_key", config.apiKey);

  const uploadUrl = `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`;
  const response = await fetch(uploadUrl, { method: "POST", body: formData });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Upload failed: ${error}`);
  }

  return response.json();
}

function buildWatermarkUrl(secureUrl, creditText) {
  // Encode text for Cloudinary URL (spaces and special chars)
  const text = `© ${creditText}`;
  const encoded = encodeURIComponent(text).replace(/%2F/g, "%252F");

  // Chained transformations: 1) resize/optimize, 2) text overlay
  const transform = [
    TRANSFORM,
    `l_text:arial_16_bold:${encoded},co_rgb:FFFFFF,g_south_west,x_12,y_12`,
  ].join("/");

  // Insert transform into the Cloudinary URL path after 'upload/'
  return secureUrl.replace("/image/upload/", `/image/upload/${transform}/`);
}

async function watermarkFile(filePath, creditText, config) {
  const buffer = readFileSync(filePath);
  const displayName = basename(filePath);
  const ext = extname(filePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : "image/jpeg";

  process.stdout.write(`[WATERMARK] ${displayName}... `);

  const base64Content = buffer.toString("base64");
  const dataUri = `data:${mimeType};base64,${base64Content}`;

  // Upload original (no transform applied yet)
  const result = await uploadToCloudinary(dataUri, config);

  // Build URL with resize + watermark overlay
  const watermarkUrl = buildWatermarkUrl(result.secure_url, creditText);

  // Download watermarked image
  const response = await fetch(watermarkUrl);
  if (!response.ok) {
    throw new Error(`Failed to download watermarked image: ${response.status}`);
  }
  const watermarked = Buffer.from(await response.arrayBuffer());

  writeFileSync(filePath, watermarked);

  const origKB = Math.round(buffer.length / 1024);
  const newKB = Math.round(watermarked.length / 1024);
  console.log(`done (${origKB}KB → ${newKB}KB)`);
}

async function main() {
  const { credit, files } = parseArgs(process.argv);
  const config = getCloudinaryConfig();

  if (!config) {
    console.error("Error: Cloudinary credentials not found. Set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in .env");
    process.exit(1);
  }

  console.log(`Credit: © ${credit}`);
  console.log(`Files: ${files.length}\n`);

  for (const filePath of files) {
    try {
      await watermarkFile(filePath, credit, config);
    } catch (error) {
      console.error(`\n[ERROR] ${basename(filePath)}: ${error.message}`);
    }
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
