// TinaCMS datalayer is ESM-only in v2, so this file uses ESM
import { MongoClient } from 'mongodb';
import pkg from 'mongodb-level';
const { MongodbLevel } = pkg;
import { createDatabase, resolve } from '@tinacms/datalayer';
import { GitHubProvider } from 'tinacms-gitprovider-github';
import { createAppAuth } from '@octokit/auth-app';

let client = null;
let database = null;
let databaseClient = null;

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

    // Handle private key formatting (Azure may store it with escaped newlines or base64 encoded)
    let formattedPrivateKey = privateKey
        .replace(/\\n/g, '\n')           // Handle escaped newlines
        .replace(/\\r/g, '')              // Remove escaped carriage returns
        .replace(/^["']|["']$/g, '')      // Remove surrounding quotes
        .trim();

    // If key doesn't have PEM headers, assume it's base64 encoded
    if (!formattedPrivateKey.includes('-----BEGIN')) {
        try {
            formattedPrivateKey = Buffer.from(formattedPrivateKey, 'base64').toString('utf8');
        } catch (e) {
            // If base64 decode fails, wrap as-is
            formattedPrivateKey = `-----BEGIN RSA PRIVATE KEY-----\n${formattedPrivateKey}\n-----END RSA PRIVATE KEY-----`;
        }
    }

    const auth = createAppAuth({
        appId,
        privateKey: formattedPrivateKey,
        installationId,
    });

    // Get an installation access token
    const { token } = await auth({ type: 'installation' });
    return token;
}

export async function getDatabaseClient() {
    if (databaseClient) return databaseClient;

    const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
    if (!connectionString) {
        throw new Error('COSMOS_DB_CONNECTION_STRING environment variable is required');
    }

    // Get GitHub token from App authentication
    const githubToken = await getGitHubToken();

    console.log('Connecting to MongoDB...');
    client = new MongoClient(connectionString);
    await client.connect();
    console.log('MongoDB connected');

    const dbName = process.env.COSMOS_DB_NAME || 'tinacms';
    console.log('Creating MongodbLevel with dbName:', dbName);
    const level = new MongodbLevel({
        client,
        dbName,
    });

    // Open the level database (required by abstract-level)
    console.log('Opening level database...');
    await level.open();
    console.log('Level database opened, status:', level.status);

    // Configure GitHub provider for content
    const gitProvider = new GitHubProvider({
        owner: process.env.GITHUB_OWNER || 'sjifire',
        repo: process.env.GITHUB_REPO || 'website',
        branch: process.env.GITHUB_BRANCH || 'main',
        token: githubToken,
    });

    // Create the TinaCMS database
    database = createDatabase({
        databaseAdapter: level,
        gitProvider,
    });

    // Create a databaseClient wrapper with .request() method
    // TinaNodeBackend expects this interface to execute GraphQL queries
    databaseClient = {
        request: async ({ query, variables, user }) => {
            return await resolve({
                database,
                query,
                variables,
                ctxUser: user ? { sub: user.sub || user.id || user } : undefined,
            });
        }
    };

    return databaseClient;
}

export async function closeDatabase() {
    if (client) {
        await client.close();
        client = null;
        database = null;
        databaseClient = null;
    }
}
