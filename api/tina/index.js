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

// Create an Express-like response adapter for Azure Functions
function createResponseAdapter(context) {
    const headers = {};
    let statusCode = 200;
    const chunks = [];

    const res = {
        statusCode: 200,
        setHeader: (name, value) => {
            headers[name.toLowerCase()] = value;
        },
        getHeader: (name) => headers[name.toLowerCase()],
        writeHead: (code, headersObj) => {
            statusCode = code;
            res.statusCode = code;
            if (headersObj) {
                Object.entries(headersObj).forEach(([k, v]) => {
                    headers[k.toLowerCase()] = v;
                });
            }
        },
        write: (chunk) => {
            chunks.push(chunk);
            return true;
        },
        end: (chunk) => {
            if (chunk) chunks.push(chunk);
            const body = chunks.join('');
            context.res = {
                status: statusCode,
                headers,
                body: headers['content-type']?.includes('application/json')
                    ? JSON.parse(body || '{}')
                    : body
            };
        },
        // Express-style helpers
        status: function(code) {
            statusCode = code;
            res.statusCode = code;
            return res;
        },
        json: (data) => {
            headers['content-type'] = 'application/json';
            context.res = {
                status: statusCode,
                headers,
                body: data
            };
        },
        send: (data) => {
            context.res = {
                status: statusCode,
                headers,
                body: data
            };
        }
    };

    return res;
}

module.exports = async function (context, req) {
    context.log('TinaCMS backend request:', req.method, req.url);

    try {
        const tinaBackend = await getBackend();

        // Convert Azure Functions request to Node-like request
        const nodeReq = {
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: req.body,
            query: req.query
        };

        const res = createResponseAdapter(context);

        // Handle the request through TinaCMS backend
        await tinaBackend(nodeReq, res);

        // Ensure response is set
        if (!context.res) {
            context.res = {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: { message: 'OK' }
            };
        }
    } catch (error) {
        context.log.error('TinaCMS backend error:', error);
        context.res = {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
            body: {
                error: 'Internal server error',
                message: error.message,
                stack: error.stack,
                name: error.name
            }
        };
    }
};
