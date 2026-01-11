import { createDatabase, createLocalDatabase } from "@tinacms/datalayer";
// @ts-ignore - no types for mongodb-level
import { MongodbLevel } from "mongodb-level";
// @ts-ignore - no types for tinacms-gitprovider-github
import { GitHubProvider } from "tinacms-gitprovider-github";

const isLocal = process.env.TINA_PUBLIC_IS_LOCAL === "true";
const cosmosConnectionString = process.env.COSMOS_DB_CONNECTION_STRING;
const githubToken = process.env.GITHUB_TOKEN;

// Use Cosmos DB during build (for schema indexing) when connection string is available
// Use local database for local development
let database;

if (isLocal || !cosmosConnectionString || !githubToken) {
  // Local development: use local filesystem database
  database = createLocalDatabase();
} else {
  // CI build: use Cosmos DB to index schema with GitHub provider
  // Always use 'main' collection for schema (shared across all environments)
  // GitHubProvider branch determines which content is read from Git
  const branch = process.env.GITHUB_BRANCH || "main";
  const owner = process.env.GITHUB_OWNER || process.env.GITHUB_REPOSITORY?.split("/")[0];
  const repo = process.env.GITHUB_REPO || process.env.GITHUB_REPOSITORY?.split("/")[1];

  console.log("[TinaCMS Build] Indexing schema to Cosmos DB");
  console.log(`  Git Branch: ${branch}`);
  console.log(`  Collection: main`);

  database = createDatabase({
    gitProvider: new GitHubProvider({
      branch,
      owner,
      repo,
      token: githubToken,
    }),
    databaseAdapter: new MongodbLevel({
      collectionName: "main",
      dbName: process.env.COSMOS_DB_NAME || "tinacms",
      mongoUri: cosmosConnectionString,
    }),
  });
}

export default database;
