require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const { createDatabase, createLocalDatabase, resolve: tinaResolve } = require("@tinacms/datalayer");
const { MongodbLevel } = require("mongodb-level");
const { GitHubProvider } = require("tinacms-gitprovider-github");
const { createAppAuth } = require("@octokit/auth-app");

const isLocal = process.env.TINA_PUBLIC_IS_LOCAL === "true";

const branch =
  process.env.GITHUB_BRANCH ||
  process.env.HEAD ||
  "main";

// Generate a GitHub installation access token from App credentials
async function getGitHubToken() {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

  if (!appId || !privateKey || !installationId) {
    throw new Error(
      "GitHub App credentials required: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID"
    );
  }

  // Handle private key formatting (may be base64 encoded or have escaped newlines)
  let formattedKey = privateKey
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "")
    .replace(/^["']|["']$/g, "")
    .trim();

  if (!formattedKey.includes("-----BEGIN")) {
    formattedKey = Buffer.from(formattedKey, "base64").toString("utf8");
  }

  const auth = createAppAuth({
    appId,
    privateKey: formattedKey,
    installationId,
  });

  const { token } = await auth({ type: "installation" });
  return token;
}

// For production, create the database with GitHub App auth
async function createProdDatabase() {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  console.log("Creating production database with GitHub provider:");
  console.log("  Owner:", owner || "(NOT SET)");
  console.log("  Repo:", repo || "(NOT SET)");
  console.log("  Branch:", branch);
  console.log("  App ID:", process.env.GITHUB_APP_ID ? "set" : "(NOT SET)");
  console.log("  Installation ID:", process.env.GITHUB_APP_INSTALLATION_ID ? "set" : "(NOT SET)");
  console.log("  Private Key:", process.env.GITHUB_APP_PRIVATE_KEY ? "set (length: " + process.env.GITHUB_APP_PRIVATE_KEY.length + ")" : "(NOT SET)");

  if (!owner || !repo) {
    throw new Error("GITHUB_OWNER and GITHUB_REPO environment variables are required");
  }

  const githubToken = await getGitHubToken();
  console.log("  GitHub token generated successfully");

  return createDatabase({
    gitProvider: new GitHubProvider({
      branch,
      owner,
      repo,
      token: githubToken,
    }),
    databaseAdapter: new MongodbLevel({
      collectionName: branch,
      dbName: process.env.COSMOS_DB_NAME || "tinacms",
      mongoUri: process.env.COSMOS_DB_CONNECTION_STRING,
    }),
  });
}

// Wrap database in a client with .request() method that TinaNodeBackend expects
function createDatabaseClient(database) {
  return {
    request: async ({ query, variables, user }) => {
      return await tinaResolve({
        database,
        query,
        variables,
        ctxUser: user ? { sub: user.sub || user.id || user } : undefined,
      });
    }
  };
}

// Export a function that returns the databaseClient (handles async for prod)
async function getDatabase() {
  const database = isLocal ? createLocalDatabase() : await createProdDatabase();
  return createDatabaseClient(database);
}

module.exports = { getDatabase };
