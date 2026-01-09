const { app } = require("@azure/functions");
const { getGitHubToken, getGitHubConfig } = require("../lib/github.js");

const MEDIA_ROOT = "src/assets/images";

// GitHub API helper
async function githubRequest(endpoint, options = {}) {
  const token = await getGitHubToken();
  const { owner, repo } = getGitHubConfig();

  const url = `https://api.github.com/repos/${owner}/${repo}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub API error: ${response.status} - ${error}`);
  }

  return response.json();
}

// List files in the media directory
async function listMedia(directory = "") {
  const { branch } = getGitHubConfig();
  const mediaPath = directory ? `${MEDIA_ROOT}/${directory}` : MEDIA_ROOT;

  try {
    const contents = await githubRequest(`/contents/${mediaPath}?ref=${branch}`);

    if (!Array.isArray(contents)) {
      return [];
    }

    const items = [];
    for (const item of contents) {
      if (item.type === "file" && isMediaFile(item.name)) {
        // Remove 'src/' prefix from path for public URL
        const publicPath = item.path.replace(/^src\//, "/");
        items.push({
          type: "file",
          id: item.path,
          filename: item.name,
          directory: directory || "",
          src: publicPath,
          previewSrc: publicPath,
          thumbnails: {
            "75x75": publicPath,
            "400x400": publicPath,
            "1000x1000": publicPath,
          },
        });
      } else if (item.type === "dir") {
        items.push({
          type: "dir",
          id: item.path,
          filename: item.name,
          directory: directory || "",
        });
      }
    }

    return items;
  } catch (error) {
    if (error.message.includes("404")) {
      return [];
    }
    throw error;
  }
}

function isMediaFile(filename) {
  const ext = filename.toLowerCase().split(".").pop();
  return ["jpg", "jpeg", "png", "gif", "webp", "svg", "pdf"].includes(ext);
}

// Upload a file to the media directory
async function uploadMedia(filename, content, directory = "") {
  const { branch } = getGitHubConfig();
  const filePath = directory ? `${MEDIA_ROOT}/${directory}/${filename}` : `${MEDIA_ROOT}/${filename}`;

  // Check if file exists to get its SHA (required for updates)
  let sha;
  try {
    const existing = await githubRequest(`/contents/${filePath}?ref=${branch}`);
    sha = existing.sha;
  } catch (e) {
    // File doesn't exist, that's fine
  }

  const body = {
    message: `Add media: ${filename}`,
    content: content, // Already base64 encoded
    branch,
  };

  if (sha) {
    body.sha = sha;
    body.message = `Update media: ${filename}`;
  }

  const result = await githubRequest(`/contents/${filePath}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

  // Remove 'src/' prefix from path for public URL
  const publicPath = result.content.path.replace(/^src\//, "/");
  return {
    type: "file",
    id: result.content.path,
    filename: result.content.name,
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

// Delete a file from the media directory
async function deleteMedia(filepath) {
  const { branch } = getGitHubConfig();

  // Get file SHA (required for deletion)
  const existing = await githubRequest(`/contents/${filepath}?ref=${branch}`);

  await githubRequest(`/contents/${filepath}`, {
    method: "DELETE",
    body: JSON.stringify({
      message: `Delete media: ${filepath.split("/").pop()}`,
      sha: existing.sha,
      branch,
    }),
  });

  return { success: true };
}

// CORS headers helper
function getCorsHeaders(request) {
  const origin = request.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

app.http("media", {
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "media/{*path}",
  handler: async (request, context) => {
    const corsHeaders = getCorsHeaders(request);

    // Handle preflight
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders };
    }

    try {
      if (request.method === "GET") {
        // List media files
        const directory = new URL(request.url).searchParams.get("directory") || "";
        const items = await listMedia(directory);
        return {
          status: 200,
          headers: corsHeaders,
          jsonBody: items,
        };
      }

      if (request.method === "POST") {
        // Upload media file
        const formData = await request.formData();
        const file = formData.get("file");
        const directory = formData.get("directory") || "";

        if (!file) {
          return {
            status: 400,
            headers: corsHeaders,
            jsonBody: { error: "No file provided" },
          };
        }

        const arrayBuffer = await file.arrayBuffer();
        const base64Content = Buffer.from(arrayBuffer).toString("base64");

        const result = await uploadMedia(file.name, base64Content, directory);
        return {
          status: 200,
          headers: corsHeaders,
          jsonBody: result,
        };
      }

      if (request.method === "DELETE") {
        // Delete media file
        const body = await request.json();
        const filepath = body.filepath || request.params.path;

        if (!filepath) {
          return {
            status: 400,
            headers: corsHeaders,
            jsonBody: { error: "No filepath provided" },
          };
        }

        await deleteMedia(filepath);
        return {
          status: 200,
          headers: corsHeaders,
          jsonBody: { success: true },
        };
      }

      return {
        status: 405,
        headers: corsHeaders,
        jsonBody: { error: "Method not allowed" },
      };
    } catch (error) {
      context.error("Media error:", error.message);
      return {
        status: 500,
        headers: corsHeaders,
        jsonBody: { error: error.message },
      };
    }
  },
});
