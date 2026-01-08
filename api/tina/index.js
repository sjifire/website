// TinaCMS datalayer is ESM-only, so we need dynamic imports
let loadError = null;
let modulesLoaded = false;
let TinaNodeBackend, LocalBackendAuthProvider, getDatabaseClient;

async function loadModules() {
    if (modulesLoaded) return;
    try {
        const datalayer = await import('@tinacms/datalayer');
        TinaNodeBackend = datalayer.TinaNodeBackend;
        LocalBackendAuthProvider = datalayer.LocalBackendAuthProvider;
        const database = await import('./database.js');
        getDatabaseClient = database.getDatabaseClient;
        modulesLoaded = true;
    } catch (err) {
        loadError = err;
        throw err;
    }
}

let backend = null;

async function getBackend() {
    await loadModules();
    if (backend) return backend;

    const databaseClient = await getDatabaseClient();

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
            // Azure Functions expects body as string for proper content-type handling
            context.res = {
                status: statusCode,
                headers,
                body: body || ''
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
    context.log('Request path params:', JSON.stringify(req.params));

    // Ensure we always return a response
    const sendError = (statusCode, message, details = {}) => {
        context.res = {
            status: statusCode,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: message,
                ...details
            })
        };
    };

    try {
        // Extract the path after /api/tina/
        const path = req.params?.path || '';
        context.log('TinaCMS path:', path);

        // Health check endpoint - also reports module loading errors
        if (path === 'health') {
            // Try to load modules to check for errors
            try {
                await loadModules();
                context.res = {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'ok', timestamp: new Date().toISOString(), modulesLoaded })
                };
            } catch (err) {
                context.res = {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        status: 'error',
                        loadError: err.message,
                        stack: err.stack
                    })
                };
            }
            return;
        }

        const tinaBackend = await getBackend();
        context.log('TinaCMS backend initialized');

        // Convert Azure Functions request to Node-like request
        // TinaCMS expects the URL to include the path for routing
        const nodeReq = {
            method: req.method,
            url: `/api/tina/${path}`,
            headers: req.headers,
            body: req.body,
            query: req.query
        };

        context.log('Node request URL:', nodeReq.url);

        const res = createResponseAdapter(context);

        // Handle the request through TinaCMS backend
        await tinaBackend(nodeReq, res);

        // Ensure response is set
        if (!context.res) {
            sendError(500, 'No response generated');
        }
    } catch (error) {
        context.log.error('TinaCMS backend error:', error.message);
        context.log.error('Stack:', error.stack);
        sendError(500, 'Internal server error', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
    }
};
