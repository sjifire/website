const { TinaNodeBackend, LocalBackendAuthProvider } = require('@tinacms/datalayer');
const { getDatabase } = require('./database');

let backend = null;

async function getBackend() {
    if (backend) return backend;

    const databaseClient = await getDatabase();

    // Use LocalBackendAuthProvider since Azure Static Web Apps
    // handles authentication at the platform level via staticwebapp.config.json
    // Only authenticated users can reach /api/* routes
    backend = TinaNodeBackend({
        authProvider: LocalBackendAuthProvider(),
        databaseClient,
    });

    return backend;
}

module.exports = async function (context, req) {
    context.log('TinaCMS backend request:', req.method, req.url);

    try {
        const tinaBackend = await getBackend();

        // Convert Azure Functions request to standard Node request format
        const nodeReq = {
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: req.body,
            query: req.query
        };

        // Handle the request through TinaCMS backend
        const response = await tinaBackend(nodeReq, {
            status: (code) => ({
                json: (data) => {
                    context.res = {
                        status: code,
                        headers: { 'Content-Type': 'application/json' },
                        body: data
                    };
                },
                send: (data) => {
                    context.res = {
                        status: code,
                        body: data
                    };
                }
            }),
            json: (data) => {
                context.res = {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: data
                };
            },
            send: (data) => {
                context.res = {
                    status: 200,
                    body: data
                };
            },
            setHeader: () => {}
        });

        // If response wasn't set by the callbacks, return it directly
        if (!context.res && response) {
            context.res = {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: response
            };
        }
    } catch (error) {
        context.log.error('TinaCMS backend error:', error);
        context.res = {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
            body: { error: 'Internal server error', message: error.message }
        };
    }
};
