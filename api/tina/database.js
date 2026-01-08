const { MongoClient } = require('mongodb');
const { MongodbLevel } = require('mongodb-level');
const { createDatabase, GitHubProvider } = require('@tinacms/datalayer');
const { createAppAuth } = require('@octokit/auth-app');

let client = null;
let database = null;

// Generate a GitHub installation access token from App credentials
async function getGitHubToken() {
    const appId = process.env.GITHUB_APP_ID;
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
    const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

    if (!appId || !privateKey || !installationId) {
        throw new Error(
            'GitHub App credentials required: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID'
        );
    }

    // Handle private key formatting (Azure may store it with escaped newlines)
    const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');

    const auth = createAppAuth({
        appId,
        privateKey: formattedPrivateKey,
        installationId,
    });

    // Get an installation access token
    const { token } = await auth({ type: 'installation' });
    return token;
}

async function getDatabase() {
    if (database) return database;

    const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
    if (!connectionString) {
        throw new Error('COSMOS_DB_CONNECTION_STRING environment variable is required');
    }

    // Get GitHub token from App authentication
    const githubToken = await getGitHubToken();

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
