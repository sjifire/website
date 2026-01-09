require('dotenv').config();
const { MongoClient } = require('mongodb');

async function testConnection() {
    const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
    const dbName = process.env.COSMOS_DB_NAME || 'tinacms';

    if (!connectionString) {
        console.error('COSMOS_DB_CONNECTION_STRING not set');
        process.exit(1);
    }

    console.log('Connecting to CosmosDB...');
    console.log('Database:', dbName);

    const client = new MongoClient(connectionString);
    console.log('creating client...')
    console.log(connectionString)

    try {
        await client.connect();
        console.log('Connected successfully!');

        const db = client.db(dbName);
        const collections = await db.listCollections().toArray();
        console.log('Collections:', collections.map(c => c.name));

        await client.close();
        console.log('Connection closed.');
    } catch (error) {
        console.error('Connection failed:', error);
        process.exit(1);
    }
}

testConnection();
