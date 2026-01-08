const { MongoClient } = require('mongodb');
const { MongodbLevel } = require('mongodb-level');
const { createDatabase, GitHubProvider } = require('@tinacms/datalayer');

let client = null;
let database = null;

async function getDatabase() {
    if (database) return database;

    const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
    if (!connectionString) {
        throw new Error('COSMOS_DB_CONNECTION_STRING environment variable is required');
    }

    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
        throw new Error('GITHUB_TOKEN environment variable is required');
    }

    client = new MongoClient(connectionString);
    await client.connect();

    const level = new MongodbLevel({
        client,
        dbName: process.env.COSMOS_DB_NAME || 'tinacms',
    });

    // Configure GitHub provider for content
    const gitProvider = new GitHubProvider({
        owner: process.env.GITHUB_OWNER || 'sjifire',
        repo: process.env.GITHUB_REPO || 'website',
        branch: process.env.GITHUB_BRANCH || 'main',
        token: githubToken,
    });

    // Wrap the level store with TinaCMS database
    database = createDatabase({
        level,
        gitProvider,
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
