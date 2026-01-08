const { MongoClient } = require('mongodb');
const { MongodbLevel } = require('mongodb-level');

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

    database = new MongodbLevel({
        client,
        dbName: process.env.COSMOS_DB_NAME || 'tinacms',
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
