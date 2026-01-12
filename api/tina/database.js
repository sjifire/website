const { createDatabase, createLocalDatabase, resolve: tinaResolve } = require("@tinacms/datalayer");
const { MongodbLevel } = require("mongodb-level");
const { GitHubProvider } = require("tinacms-gitprovider-github");
const { getGitHubToken, getGitHubConfig } = require("../src/lib/github.js");

const isLocal = process.env.TINA_PUBLIC_IS_LOCAL === "true";

// Sanitize branch name for use as MongoDB collection name
function sanitizeCollectionName(branch) {
  // MongoDB collection names can't contain $ or null, and shouldn't start with "system."
  // Replace slashes and other problematic chars with underscores
  return branch.replace(/[/$\x00]/g, "_").replace(/^system\./, "sys_");
}

// For production, create the database with GitHub App auth
// Use branch-specific collections so preview branches have their own schema
async function createProdDatabase() {
  const { owner, repo, branch } = getGitHubConfig();
  const collectionName = sanitizeCollectionName(branch);

  console.log("Creating production database with GitHub provider:");
  console.log("  Owner:", owner || "(NOT SET)");
  console.log("  Repo:", repo || "(NOT SET)");
  console.log("  Git Branch:", branch);
  console.log("  Collection:", collectionName);

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
      collectionName,
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
