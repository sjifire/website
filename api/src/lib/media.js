const github = require("./github.js");

const MEDIA_ROOT = "src/assets/media";
const MEDIA_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "svg", "pdf"];

// Format a GitHub file item into TinaCMS media format
function formatMediaItem(repoPath, filename, directory) {
  const publicPath = repoPath.replace(/^src\//, "/");
  return {
    type: "file",
    id: repoPath,
    filename,
    directory: directory || "",
    src: publicPath,
    previewSrc: publicPath,
    thumbnails: {
      "75x75": publicPath,
      "400x400": publicPath,
      "1000x1000": publicPath,
    },
  };
}

function isMediaFile(filename) {
  if (!filename) return false;
  const ext = filename.toLowerCase().split(".").pop();
  return MEDIA_EXTENSIONS.includes(ext);
}

// CORS headers helper
function getCorsHeaders(request) {
  const origin = request?.headers?.get?.("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
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
    const { branch } = getGitHubConfig();
    const cleanDir = normalizeDirectory(directory);
    const filePath = cleanDir
      ? `${MEDIA_ROOT}/${cleanDir}/${filename}`
      : `${MEDIA_ROOT}/${filename}`;
    const encodedPath = encodePathForGitHub(filePath);

    // Check if file exists to get its SHA (required for updates)
    let sha;
    try {
      const existing = await githubRequest(`/contents/${encodedPath}?ref=${branch}`);
      sha = existing.sha;
    } catch (e) {
      // File doesn't exist, that's fine
    }

    const body = {
      message: sha ? `Update media: ${filename}` : `Add media: ${filename}`,
      content,
      branch,
      ...(sha && { sha }),
    };

    const result = await githubRequest(`/contents/${encodedPath}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });

    return formatMediaItem(result.content.path, result.content.name, directory);
  }

  // Delete a file from the media directory
  async function deleteMedia(filepath) {
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
