import { app } from "@azure/functions";
import {
  listMedia,
  uploadMedia,
  deleteMedia,
  getCorsHeaders,
} from "../lib/media.js";
import { requireAdmin, getUserForLogging, getGitAuthor } from "../lib/auth.js";

async function handleGet(request, corsHeaders) {
  const directory = new URL(request.url).searchParams.get("directory") || "";
  const items = await listMedia(directory);
  return { status: 200, headers: corsHeaders, jsonBody: items };
}

async function handlePost(request, corsHeaders, author) {
  const formData = await request.formData();
  const file = formData.get("file");
  const directory = formData.get("directory") || "";

  if (!file) {
    return { status: 400, headers: corsHeaders, jsonBody: { error: "No file provided" } };
  }

  const arrayBuffer = await file.arrayBuffer();
  const base64Content = Buffer.from(arrayBuffer).toString("base64");
  const result = await uploadMedia(file.name, base64Content, directory, author);
  return { status: 200, headers: corsHeaders, jsonBody: result };
}

async function handleDelete(request, corsHeaders, author) {
  const body = await request.json();
  const filepath = body.filepath || request.params.path;

  if (!filepath) {
    return { status: 400, headers: corsHeaders, jsonBody: { error: "No filepath provided" } };
  }

  await deleteMedia(filepath, author);
  return { status: 200, headers: corsHeaders, jsonBody: { success: true } };
}

app.http("media", {
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "media/{*path}",
  handler: async (request) => {
    const corsHeaders = getCorsHeaders(request);

    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders };
    }

    // Require admin authentication
    const authError = requireAdmin(request);
    if (authError) {
      return { ...authError, headers: corsHeaders };
    }

    const author = getGitAuthor(request);
    console.log(`Media API access by user: ${getUserForLogging(request)}`);

    try {
      if (request.method === "GET") {
        return await handleGet(request, corsHeaders);
      }

      if (request.method === "POST") {
        return await handlePost(request, corsHeaders, author);
      }

      if (request.method === "DELETE") {
        return await handleDelete(request, corsHeaders, author);
      }

      return { status: 405, headers: corsHeaders, jsonBody: { error: "Method not allowed" } };
    } catch (error) {
      console.error("Media error:", error.message, error.stack);
      return { status: 500, headers: corsHeaders, jsonBody: { error: "Internal server error" } };
    }
  },
});
