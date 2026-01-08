const { MongoClient } = require('mongodb');
const { MongodbLevel } = require('mongodb-level');
const { createDatabase } = require('@tinacms/datalayer');

let client = null;
let database = null;

async function getDatabase() {
    if (database) return database;

    const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
    if (!connectionString) {
        throw new Error('COSMOS_DB_CONNECTION_STRING environment variable is required');
    }

    client = new MongoClient(connectionString);
    await client.connect();

    const level = new MongodbLevel({
        client,
        dbName: process.env.COSMOS_DB_NAME || 'tinacms',
    });

    // Wrap the level store with TinaCMS database
    database = createDatabase({
        level,
    });

    return database;
}

async function closeDatabase() {
    if (client) {
        await client.close();
        client = null;
        database = null;
    }
}

module.exports = { getDatabase, closeDatabase };
