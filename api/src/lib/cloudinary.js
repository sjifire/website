const crypto = require("crypto");
const siteConfig = require("../../site-config.json");

// Extract cloud name from cloudinaryRootUrl
// e.g., "https://res.cloudinary.com/san-juan-fire-district-3" -> "san-juan-fire-district-3"
const CLOUD_NAME = siteConfig.cloudinaryRootUrl.split("/").pop();

// File types that can be optimized
const OPTIMIZABLE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"];

// Skip optimization for files smaller than this (already optimized)
const MIN_SIZE_BYTES = 500 * 1024; // 500KB

// Transformation for web-ready images
const TRANSFORM = "w_2000,h_2000,c_limit,q_auto";

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
  // Sort params alphabetically and create string
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return crypto
    .createHash("sha1")
    .update(sortedParams + apiSecret)
    .digest("hex");
}

/**
 * Optimize an image via Cloudinary Upload API
 * @param {string} base64Content - Base64-encoded image content (without data URI prefix)
 * @param {string} filename - Original filename
 * @returns {Promise<{content: string, optimized: boolean}>} - Optimized base64 content and flag
 */
async function optimizeImage(base64Content, filename) {
  const config = getCloudinaryConfig();

  // If no credentials, return original
  if (!config) {
    return { content: base64Content, optimized: false, reason: "no_credentials" };
  }

  // Check if file type is optimizable
  if (!isOptimizableFile(filename)) {
    return { content: base64Content, optimized: false, reason: "not_optimizable_type" };
  }

  // Check file size - skip if already small
  const originalSizeBytes = Buffer.from(base64Content, "base64").length;
  if (originalSizeBytes < MIN_SIZE_BYTES) {
    return { content: base64Content, optimized: false, reason: "already_small" };
  }

  try {
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
      console.error("Cloudinary upload failed:", error);
      return { content: base64Content, optimized: false, reason: "upload_failed" };
    }

    const result = await response.json();

    // Fetch the optimized image
    const optimizedUrl = result.secure_url;
    const imageResponse = await fetch(optimizedUrl);

    if (!imageResponse.ok) {
      console.error("Failed to fetch optimized image");
      return { content: base64Content, optimized: false, reason: "fetch_failed" };
    }

    const optimizedBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const optimizedBase64 = optimizedBuffer.toString("base64");
    const optimizedSizeBytes = optimizedBuffer.length;

    // Only use optimized if it's actually smaller
    if (optimizedSizeBytes >= originalSizeBytes) {
      return { content: base64Content, optimized: false, reason: "not_smaller" };
    }

    const savedBytes = originalSizeBytes - optimizedSizeBytes;
    const savedPercent = Math.round((savedBytes / originalSizeBytes) * 100);
    console.log(
      `Optimized ${filename}: ${Math.round(originalSizeBytes / 1024)}KB -> ${Math.round(optimizedSizeBytes / 1024)}KB (saved ${savedPercent}%)`
    );

    return {
      content: optimizedBase64,
      optimized: true,
      originalSize: originalSizeBytes,
      optimizedSize: optimizedSizeBytes,
    };
  } catch (error) {
    console.error("Cloudinary optimization error:", error.message);
    return { content: base64Content, optimized: false, reason: "error" };
  }
}

module.exports = {
  optimizeImage,
  isOptimizableFile,
  getCloudinaryConfig,
  // Expose for testing
  CLOUD_NAME,
  MIN_SIZE_BYTES,
  TRANSFORM,
  generateSignature,
};
