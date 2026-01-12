#!/usr/bin/env node
/**
 * Reset TinaCMS Database
 *
 * Drops the TinaCMS database in Cosmos DB to force a clean re-index.
 * TinaCMS will automatically rebuild its index from git on the next request.
 *
 * Usage:
 *   node scripts/reset-tina-db.js
 *
 * Requires .env file with:
 *   COSMOS_DB_CONNECTION_STRING=mongodb+srv://...
 *   COSMOS_DB_NAME=tinacms (optional, defaults to "tinacms")
 */

require("dotenv").config();
const { MongoClient } = require("mongodb");

async function resetDatabase() {
  const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
  const dbName = process.env.COSMOS_DB_NAME || "tinacms";

  if (!connectionString) {
    console.error("Error: COSMOS_DB_CONNECTION_STRING not found in environment");
    console.error("Make sure you have a .env file with your Cosmos DB connection string");
    process.exit(1);
  }

  console.log(`Connecting to database: ${dbName}`);

  const client = new MongoClient(connectionString);

  try {
    await client.connect();
    console.log("Connected to Cosmos DB");

    const db = client.db(dbName);

    // List collections before dropping
    const collections = await db.listCollections().toArray();
    console.log(`Found ${collections.length} collection(s):`, collections.map(c => c.name).join(", ") || "(none)");

    if (collections.length === 0) {
      console.log("Database is already empty, nothing to reset");
      return;
    }

    // Drop the entire database
    console.log(`Dropping database: ${dbName}...`);
    await db.dropDatabase();
    console.log("Database dropped successfully!");
    console.log("\nTinaCMS will rebuild its index from git on the next request.");

  } catch (error) {
    console.error("Error resetting database:", error.message);
    process.exit(1);
  } finally {
    await client.close();
    console.log("Connection closed");
  }
}

// Run if called directly
resetDatabase();
