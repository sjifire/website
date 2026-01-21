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
// 2000px max supports retina displays for most site use cases
// Keep original format (PNG/JPG) - Cloudinary CDN handles WebP/AVIF at runtime
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
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return crypto
    .createHash("sha1")
    .update(sortedParams + apiSecret)
    .digest("hex");
}

function getMimeType(filename) {
  const ext = filename.toLowerCase().split(".").pop();
  const mimeTypes = { png: "image/png", gif: "image/gif", webp: "image/webp" };
  return mimeTypes[ext] || "image/jpeg";
}

async function uploadToCloudinary(dataUri, config) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { timestamp, transformation: TRANSFORM };
  const signature = generateSignature(params, config.apiSecret);

  const formData = new FormData();
  formData.append("file", dataUri);
  formData.append("timestamp", timestamp.toString());
  formData.append("transformation", TRANSFORM);
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

async function fetchOptimizedImage(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch optimized image");
  }
  return Buffer.from(await response.arrayBuffer());
}

async function optimizeImage(base64Content, filename) {
  const config = getCloudinaryConfig();
  if (!config) {
    return { content: base64Content, optimized: false, reason: "no_credentials" };
  }

  if (!isOptimizableFile(filename)) {
    return { content: base64Content, optimized: false, reason: "not_optimizable_type" };
  }

  const originalSizeBytes = Buffer.from(base64Content, "base64").length;
  if (originalSizeBytes < MIN_SIZE_BYTES) {
    return { content: base64Content, optimized: false, reason: "already_small" };
  }

  try {
    const mimeType = getMimeType(filename);
    const dataUri = `data:${mimeType};base64,${base64Content}`;

    const result = await uploadToCloudinary(dataUri, config);
    const optimizedBuffer = await fetchOptimizedImage(result.secure_url);

    const optimizedSizeBytes = optimizedBuffer.length;
    if (optimizedSizeBytes >= originalSizeBytes) {
      return { content: base64Content, optimized: false, reason: "not_smaller" };
    }

    const savedPercent = Math.round(((originalSizeBytes - optimizedSizeBytes) / originalSizeBytes) * 100);
    console.log(
      `Optimized ${filename}: ${Math.round(originalSizeBytes / 1024)}KB -> ${Math.round(optimizedSizeBytes / 1024)}KB (saved ${savedPercent}%)`
    );

    return {
      content: optimizedBuffer.toString("base64"),
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
