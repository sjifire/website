const { app } = require("@azure/functions");
const siteConfig = require("../../site-config.json");
const { requireAdmin } = require("../lib/auth.js");
const { isPathSafe } = require("../lib/media.js");

const CLOUDINARY_ROOT = siteConfig.cloudinaryRootUrl;
const SITE_URL = siteConfig.cloudinaryFetchUrl;

// Default transforms for PDF thumbnails
const DEFAULT_TRANSFORMS = "f_jpg,pg_1,w_200,h_200,c_thumb,q_auto";

app.http("thumb", {
  methods: ["GET", "HEAD"],
  authLevel: "anonymous",
  route: "thumb/{*path}",
  handler: async (request, context) => {
    // Require admin authentication
    const authError = requireAdmin(request, context);
    if (authError) {
      return authError;
    }

    const requestPath = request.params.path;

    if (!requestPath) {
      return { status: 400, jsonBody: { error: "Path required" } };
    }

    // Validate path doesn't contain traversal sequences
    if (!isPathSafe(requestPath)) {
      return { status: 400, jsonBody: { error: "Invalid path" } };
    }

    // Strip _thumb.jpg suffix (we add it for TinaCMS compatibility)
    const cleanPath = requestPath.replace(/_thumb\.jpg$/i, "");

    // Only process PDFs
    if (!cleanPath.toLowerCase().endsWith('.pdf')) {
      return { status: 400, jsonBody: { error: "Only PDF thumbnails supported" } };
    }

    // Construct Cloudinary fetch URL
    const cloudinaryUrl = `${CLOUDINARY_ROOT}/image/fetch/${DEFAULT_TRANSFORMS}/${SITE_URL}/assets/media/${cleanPath}`;

    context.log(`Thumbnail redirect: ${requestPath} -> ${cloudinaryUrl}`);

    // Redirect to Cloudinary
    return {
      status: 302,
      headers: {
        "Location": cloudinaryUrl,
        "Cache-Control": "public, max-age=86400", // Cache for 24 hours
      },
    };
  },
});
