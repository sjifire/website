const github = require("./github.js");
const { optimizeImage } = require("./cloudinary.js");
const siteConfig = require("../../site-config.json");

const MEDIA_ROOT = "src/assets/media";
const MEDIA_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "svg", "pdf"];
const LOCAL_AZURE_FUNCTIONS_URL = "http://localhost:7071";

// API base URL - in production this is relative, locally it needs the full URL
function getApiBase() {
  return process.env.TINA_PUBLIC_LOCAL_PROD === "true"
    ? LOCAL_AZURE_FUNCTIONS_URL
    : "";
}

// Format a GitHub file item into TinaCMS media format
function formatMediaItem(repoPath, filename, directory) {
  const publicPath = repoPath.replace(/^src\//, "/");
  const isPdf = filename.toLowerCase().endsWith(".pdf");

  // For PDFs, use the thumb API endpoint which redirects to Cloudinary
  // The _thumb.jpg suffix makes TinaCMS treat it as an image for preview
  const mediaPath = publicPath.replace(/^\/assets\/media\//, "");
  const previewPath = isPdf
    ? `${getApiBase()}/api/thumb/${mediaPath}_thumb.jpg`
    : publicPath;

  return {
    type: "file",
    id: repoPath,
    filename,
    directory: directory || "",
    src: publicPath,
    previewSrc: previewPath,
    thumbnails: {
      "75x75": previewPath,
      "400x400": previewPath,
      "1000x1000": previewPath,
    },
  };
}

function isMediaFile(filename) {
  if (!filename) return false;
  const ext = filename.toLowerCase().split(".").pop();
  return MEDIA_EXTENSIONS.includes(ext);
}

/**
 * Validate a path doesn't contain traversal sequences
 * @param {string} path - Path to validate
 * @returns {boolean} True if path is safe
 */
function isPathSafe(path) {
  if (!path) return true;

  // Check for path traversal patterns
  const dangerousPatterns = [
    "..",           // Parent directory traversal
    "//",           // Double slash
    "\\",           // Backslash (Windows path)
    "%2e",          // URL-encoded dot
    "%2f",          // URL-encoded slash
    "%5c",          // URL-encoded backslash
  ];

  const lowerPath = path.toLowerCase();
  return !dangerousPatterns.some(pattern => lowerPath.includes(pattern));
}

/**
 * Validate filepath is within the media root
 * @param {string} filepath - Full filepath to validate
 * @returns {boolean} True if path is within MEDIA_ROOT
 */
function isWithinMediaRoot(filepath) {
  if (!filepath) return false;

  // Normalize and check it starts with media root
  const normalizedPath = filepath.replace(/\/+/g, "/").replace(/^\//, "");
  return normalizedPath.startsWith(MEDIA_ROOT) || normalizedPath.startsWith(MEDIA_ROOT.substring(0));
}

// Allowed origins for CORS - loaded from config + localhost for development
const LOCAL_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:4001",
  "http://localhost:5173",
  "http://localhost:8080",
];
const ALLOWED_ORIGINS = [
  ...(siteConfig.corsAllowedOrigins || []),
  ...LOCAL_ORIGINS,
];

// CORS headers helper with origin whitelist
function getCorsHeaders(request) {
  const origin = request?.headers?.get?.("origin");
  const isLocal = process.env.TINA_PUBLIC_IS_LOCAL === "true";

  // In local dev, be more permissive; in production, use strict whitelist
  let allowOrigin;
  if (isLocal && origin?.startsWith("http://localhost")) {
    allowOrigin = origin;
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    allowOrigin = origin;
  } else {
    // Don't reflect unknown origins - use the primary production URL
    allowOrigin = siteConfig.corsAllowedOrigins?.[0] || "https://www.sjifire.org";
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// Factory function to create media operations with injected dependencies
function createMediaOperations(deps = {}) {
  const { getGitHubConfig, githubRequest } = { ...github, ...deps };

  // Normalize and encode path for GitHub API URLs
  // Removes empty segments (from double slashes or leading/trailing slashes)
  // and encodes each segment for URL safety
  function encodePathForGitHub(path) {
    return path
      .split("/")
      .filter((segment) => segment.length > 0) // Remove empty segments
      .map((segment) => encodeURIComponent(segment))
      .join("/");
  }

  // Clean directory input - remove leading/trailing slashes and whitespace
  function normalizeDirectory(directory) {
    if (!directory) return "";
    return directory.trim().replace(/^\/+|\/+$/g, "");
  }

  // List files in the media directory
  async function listMedia(directory = "") {
    // Validate directory path is safe
    if (!isPathSafe(directory)) {
      throw new Error("Invalid directory path");
    }

    const { branch } = getGitHubConfig();
    const cleanDir = normalizeDirectory(directory);
    const mediaPath = cleanDir ? `${MEDIA_ROOT}/${cleanDir}` : MEDIA_ROOT;
    const encodedPath = encodePathForGitHub(mediaPath);

    try {
      const contents = await githubRequest(`/contents/${encodedPath}?ref=${branch}`);

      if (!Array.isArray(contents)) return [];

      const items = contents
        .map((item) => {
          if (item.type === "file" && isMediaFile(item.name)) {
            return formatMediaItem(item.path, item.name, directory);
          } else if (item.type === "dir") {
            return {
              type: "dir",
              id: item.path,
              filename: item.name,
              directory: directory || "",
            };
          }
          return null;
        })
        .filter(Boolean);

      // Sort: directories first, then files alphabetically
      return items.sort((a, b) => {
        if (a.type === "dir" && b.type !== "dir") return -1;
        if (a.type !== "dir" && b.type === "dir") return 1;
        return a.filename.localeCompare(b.filename, undefined, { sensitivity: "base" });
      });
    } catch (error) {
      if (error.message.includes("404")) {
        return [];
      }
      throw error;
    }
  }

  // Upload a file to the media directory
  async function uploadMedia(filename, content, directory = "") {
    // Validate inputs are safe
    if (!isPathSafe(directory) || !isPathSafe(filename)) {
      throw new Error("Invalid path");
    }

    // Validate file type
    if (!isMediaFile(filename)) {
      throw new Error("File type not allowed");
    }

    const { branch } = getGitHubConfig();
    const cleanDir = normalizeDirectory(directory);
    const filePath = cleanDir
      ? `${MEDIA_ROOT}/${cleanDir}/${filename}`
      : `${MEDIA_ROOT}/${filename}`;
    const encodedPath = encodePathForGitHub(filePath);

    // Optimize image via Cloudinary if applicable
    const optimizationResult = await optimizeImage(content, filename);
    const { content: optimizedContent, optimized } = optimizationResult;
    const finalContent = optimizedContent;

    // Check if file exists to get its SHA (required for updates)
    let sha;
    try {
      const existing = await githubRequest(`/contents/${encodedPath}?ref=${branch}`);
      sha = existing.sha;
    } catch (e) {
      // File doesn't exist, that's fine
    }

    const commitMessage = sha
      ? `Update media: ${filename}`
      : `Add media: ${filename}${optimized ? " (optimized)" : ""}`;

    const body = {
      message: commitMessage,
      content: finalContent,
      branch,
      ...(sha && { sha }),
    };

    const result = await githubRequest(`/contents/${encodedPath}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });

    const mediaItem = formatMediaItem(result.content.path, result.content.name, directory);
    mediaItem._optimization = optimizationResult;
    return mediaItem;
  }

  // Delete a file from the media directory
  async function deleteMedia(filepath) {
    // Validate filepath is safe and within media root
    if (!isPathSafe(filepath)) {
      throw new Error("Invalid file path");
    }

    if (!isWithinMediaRoot(filepath)) {
      throw new Error("File path must be within media directory");
    }

    const { branch } = getGitHubConfig();
    const encodedPath = encodePathForGitHub(filepath);
    const existing = await githubRequest(`/contents/${encodedPath}?ref=${branch}`);

    await githubRequest(`/contents/${encodedPath}`, {
      method: "DELETE",
      body: JSON.stringify({
        message: `Delete media: ${filepath.split("/").pop()}`,
        sha: existing.sha,
        branch,
      }),
    });

    return { success: true };
  }

  return { listMedia, uploadMedia, deleteMedia };
}

// Create default instance with real dependencies
const defaultOps = createMediaOperations();

module.exports = {
  MEDIA_ROOT,
  MEDIA_EXTENSIONS,
  formatMediaItem,
  isMediaFile,
  getCorsHeaders,
  createMediaOperations,
  // Export default operations for convenience
  listMedia: defaultOps.listMedia,
  uploadMedia: defaultOps.uploadMedia,
  deleteMedia: defaultOps.deleteMedia,
};
