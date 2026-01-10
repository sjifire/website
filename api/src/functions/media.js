const { app } = require("@azure/functions");
const {
  listMedia,
  uploadMedia,
  deleteMedia,
  getCorsHeaders,
} = require("../lib/media.js");

app.http("media", {
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "media/{*path}",
  handler: async (request, context) => {
    const corsHeaders = getCorsHeaders(request);

    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders };
    }

    try {
      if (request.method === "GET") {
        const directory = new URL(request.url).searchParams.get("directory") || "";
        const items = await listMedia(directory);
        return { status: 200, headers: corsHeaders, jsonBody: items };
      }

      if (request.method === "POST") {
        const formData = await request.formData();
        const file = formData.get("file");
        const directory = formData.get("directory") || "";

        if (!file) {
          return { status: 400, headers: corsHeaders, jsonBody: { error: "No file provided" } };
        }

        const arrayBuffer = await file.arrayBuffer();
        const base64Content = Buffer.from(arrayBuffer).toString("base64");
        const result = await uploadMedia(file.name, base64Content, directory);
        return { status: 200, headers: corsHeaders, jsonBody: result };
      }

      if (request.method === "DELETE") {
        const body = await request.json();
        const filepath = body.filepath || request.params.path;

        if (!filepath) {
          return { status: 400, headers: corsHeaders, jsonBody: { error: "No filepath provided" } };
        }

        await deleteMedia(filepath);
        return { status: 200, headers: corsHeaders, jsonBody: { success: true } };
      }

      return { status: 405, headers: corsHeaders, jsonBody: { error: "Method not allowed" } };
    } catch (error) {
      context.error("Media error:", error.message);
      return { status: 500, headers: corsHeaders, jsonBody: { error: error.message } };
    }
  },
});
