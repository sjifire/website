import { createDatabase, createLocalDatabase, resolve as tinaResolve } from "@tinacms/datalayer";
// Handle both ESM default export and CommonJS module.exports
import * as MongodbLevelModule from "mongodb-level";
const MongodbLevel = MongodbLevelModule.MongodbLevel || MongodbLevelModule.default?.MongodbLevel;
import { AuthoredGitHubProvider } from "../src/lib/git-provider.js";
import { getGitHubToken, getGitHubConfig } from "../src/lib/github.js";

const isLocal = process.env.TINA_PUBLIC_IS_LOCAL === "true";

// For production, create the database with GitHub App auth
async function createProdDatabase() {
  const { owner, repo, branch } = getGitHubConfig();

  console.log("Creating production database with GitHub provider:");
  console.log("  Owner:", owner || "(NOT SET)");
  console.log("  Repo:", repo || "(NOT SET)");
  console.log("  Branch:", branch);

  if (!owner || !repo) {
    throw new Error("GITHUB_OWNER and GITHUB_REPO environment variables are required");
  }

  const githubToken = await getGitHubToken();
  console.log("  GitHub token generated successfully");

  return createDatabase({
    gitProvider: new AuthoredGitHubProvider({
      branch,
      owner,
      repo,
      token: githubToken,
    }),
    databaseAdapter: new MongodbLevel({
      collectionName: "main",
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
  const database = isLocal ? createLocalDatabase() : await createProdDatabase();
  return createDatabaseClient(database);
}
