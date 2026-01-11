const { app } = require("@azure/functions");

const CLOUDINARY_ROOT = "https://res.cloudinary.com/san-juan-fire-district-3";
const SITE_URL = "https://sjifire.netlify.app";

// Default transforms for PDF thumbnails
const DEFAULT_TRANSFORMS = "f_jpg,pg_1,w_200,h_200,c_thumb,q_auto";

app.http("thumb", {
  methods: ["GET", "HEAD"],
  authLevel: "anonymous",
  route: "thumb/{*path}",
  handler: async (request, context) => {
    const requestPath = request.params.path;

    if (!requestPath) {
      return { status: 400, jsonBody: { error: "Path required" } };
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
