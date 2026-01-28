import { app } from "@azure/functions";
import { TinaNodeBackend, LocalBackendAuthProvider } from "@tinacms/datalayer";
import { requireAdmin, getUserForLogging, getGitAuthor } from "../lib/auth.js";
import { runWithAuthor } from "../lib/git-provider.js";

const isLocal = process.env.TINA_PUBLIC_IS_LOCAL === "true";

let backend = null;

async function getBackend() {
  if (backend) return backend;

  const { getDatabase } = await import("../../tina/database.js");
  const database = await getDatabase();

  backend = TinaNodeBackend({
    authProvider: LocalBackendAuthProvider(),
    databaseClient: database,
  });

  return backend;
}

async function buildNodeRequest(request, path) {
  const body = await request.text();
  return {
    method: request.method,
    url: `/api/tina/${path}`,
    headers: Object.fromEntries(request.headers.entries()),
    body: body ? JSON.parse(body) : undefined,
    query: Object.fromEntries(new URL(request.url).searchParams.entries()),
  };
}

function createResponseCollector() {
  let statusCode = 200;
  const headers = {};
  const chunks = [];

  const nodeRes = {
    statusCode: 200,
    setHeader: (name, value) => { headers[name.toLowerCase()] = value; },
    getHeader: (name) => headers[name.toLowerCase()],
    writeHead: (code, hdrs) => {
      statusCode = code;
      if (hdrs) Object.entries(hdrs).forEach(([k, v]) => { headers[k.toLowerCase()] = v; });
    },
    write: (chunk) => { chunks.push(chunk); return true; },
    end: (chunk) => { if (chunk) chunks.push(chunk); },
  };

  const getResponse = () => ({
    status: statusCode,
    headers,
    body: chunks.join(""),
  });

  return { nodeRes, getResponse };
}

async function handleTinaRequest(request, path) {
  const tinaBackend = await getBackend();
  const nodeReq = await buildNodeRequest(request, path);
  const { nodeRes, getResponse } = createResponseCollector();

  await tinaBackend(nodeReq, nodeRes);

  return getResponse();
}

app.http("tina", {
  methods: ["GET", "POST", "PUT", "DELETE"],
  authLevel: "anonymous",
  route: "tina/{*path}",
  handler: async (request, context) => {
    const path = request.params.path || "";
    context.log("TinaCMS request:", request.method, path);

    if (path === "health") {
      // Check required environment variables (don't expose values, just presence)
      const envCheck = {
        GITHUB_APP_ID: !!process.env.GITHUB_APP_ID,
        GITHUB_APP_PRIVATE_KEY: !!process.env.GITHUB_APP_PRIVATE_KEY,
        GITHUB_APP_INSTALLATION_ID: !!process.env.GITHUB_APP_INSTALLATION_ID,
        GITHUB_OWNER: !!process.env.GITHUB_OWNER,
        GITHUB_REPO: !!process.env.GITHUB_REPO,
        COSMOS_DB_CONNECTION_STRING: !!process.env.COSMOS_DB_CONNECTION_STRING,
      };
      const allConfigured = Object.values(envCheck).every(Boolean);

      return {
        status: 200,
        jsonBody: {
          status: allConfigured ? "ok" : "misconfigured",
          timestamp: new Date().toISOString(),
          isLocal,
          envCheck,
        },
      };
    }

    const authError = requireAdmin(request, context);
    if (authError) {
      return authError;
    }

    const author = getGitAuthor(request);
    context.log(`TinaCMS access by user: ${getUserForLogging(request)}`);

    return runWithAuthor(author, async () => {
      try {
        return await handleTinaRequest(request, path);
      } catch (error) {
        context.error("TinaCMS error:", error.message, error.stack);
        // Include error details for debugging (remove in production once stable)
        return {
          status: 500,
          jsonBody: {
            error: "Internal server error",
            message: error.message,
            stack: error.stack?.split('\n').slice(0, 5),
          }
        };
      }
    });
  },
});
