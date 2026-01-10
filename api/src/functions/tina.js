const { app } = require("@azure/functions");
const { TinaNodeBackend, LocalBackendAuthProvider } = require("@tinacms/datalayer");

const isLocal = process.env.TINA_PUBLIC_IS_LOCAL === "true";

let backend = null;

async function getBackend() {
  if (backend) return backend;

  const { getDatabase } = require("../../tina/database.js");
  const database = await getDatabase();

  backend = TinaNodeBackend({
    authProvider: LocalBackendAuthProvider(),
    databaseClient: database,
  });

  return backend;
}

app.http("tina", {
  methods: ["GET", "POST", "PUT", "DELETE"],
  authLevel: "anonymous",
  route: "tina/{*path}",
  handler: async (request, context) => {
    const path = request.params.path || "";
    context.log("TinaCMS request:", request.method, path);

    // Health check endpoint
    if (path === "health") {
      return {
        status: 200,
        jsonBody: { status: "ok", timestamp: new Date().toISOString(), isLocal },
      };
    }

    try {
      const tinaBackend = await getBackend();

      // Convert Azure Functions request to Node-like request
      const body = await request.text();
      const nodeReq = {
        method: request.method,
        url: `/api/tina/${path}`,
        headers: Object.fromEntries(request.headers.entries()),
        body: body ? JSON.parse(body) : undefined,
        query: Object.fromEntries(new URL(request.url).searchParams.entries()),
      };

      // Create response collector
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

      await tinaBackend(nodeReq, nodeRes);

      const responseBody = chunks.join("");
      return {
        status: statusCode,
        headers,
        body: responseBody,
      };
    } catch (error) {
      context.error("TinaCMS error:", error.message, error.stack);
      return {
        status: 500,
        jsonBody: { error: error.message },
      };
    }
  },
});
