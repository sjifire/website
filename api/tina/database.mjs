import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });
import { createDatabase, createLocalDatabase, resolve as tinaResolve } from "@tinacms/datalayer";
import mongodbLevel from "mongodb-level";
const { MongodbLevel } = mongodbLevel;
import { GitHubProvider } from "tinacms-gitprovider-github";
import { createAppAuth } from "@octokit/auth-app";

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

// For local development, use the simple createLocalDatabase

// For production, create the database with GitHub App auth
async function createProdDatabase() {
  const githubToken = await getGitHubToken();
  return createDatabase({
    gitProvider: new GitHubProvider({
      branch,
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO,
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
export async function getDatabase() {
  var database = isLocal ? createLocalDatabase() : await createProdDatabase()
  return createDatabaseClient(database);
}

export default (async () => {
  return getDatabase();
})();
