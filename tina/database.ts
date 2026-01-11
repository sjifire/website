import { createDatabase, createLocalDatabase } from "@tinacms/datalayer";
// @ts-ignore - no types for mongodb-level
import { MongodbLevel } from "mongodb-level";

const isLocal = process.env.TINA_PUBLIC_IS_LOCAL === "true";
const cosmosConnectionString = process.env.COSMOS_DB_CONNECTION_STRING;

// Use Cosmos DB during build (for schema indexing) when connection string is available
// Use local database for local development
let database;

if (isLocal || !cosmosConnectionString) {
  // Local development: use local filesystem database
  database = createLocalDatabase();
} else {
  // Build/production: use Cosmos DB to index schema
  const branch = process.env.GITHUB_BRANCH || process.env.HEAD || "main";
  database = createDatabase({
    databaseAdapter: new MongodbLevel({
      collectionName: branch,
      dbName: process.env.COSMOS_DB_NAME || "tinacms",
      mongoUri: cosmosConnectionString,
    }),
  });
}

export default database;
