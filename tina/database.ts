import { createLocalDatabase } from "@tinacms/datalayer";

// For build/dev, use local database
// Production database (Cosmos DB) is handled by api/tina/database.mjs at runtime
export default createLocalDatabase();
