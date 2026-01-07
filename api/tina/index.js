const { TinaNodeBackend, LocalBackendAuthentication } = require('@tinacms/datalayer');
const { getDatabase } = require('./database');

// Azure AD authentication verification
async function verifyAzureADAuth(req) {
    const header = req.headers['x-ms-client-principal'];
    if (!header) return null;

    try {
        const encoded = Buffer.from(header, 'base64');
        const decoded = JSON.parse(encoded.toString('ascii'));

        // Check if user has required roles/groups
        const allowedGroups = process.env.ALLOWED_EDITOR_GROUPS?.split(',') || [];
        const userRoles = decoded.userRoles || [];

        // Allow if user is authenticated (has 'authenticated' role)
        // or is in an allowed group
        const isAuthenticated = userRoles.includes('authenticated');
        const hasGroupAccess = allowedGroups.length === 0 ||
            allowedGroups.some(group => userRoles.includes(group));

        if (isAuthenticated && hasGroupAccess) {
            return {
                isAuthorized: true,
                user: {
                    id: decoded.userId,
                    name: decoded.userDetails || decoded.userId,
                    email: decoded.userDetails || `${decoded.userId}@cms.local`
                }
            };
        }
    } catch (error) {
        console.error('Auth verification error:', error);
    }

    return null;
}

// Custom Azure AD authentication provider for TinaCMS
class AzureADBackendAuthentication {
    async isAuthorized(req) {
        const auth = await verifyAzureADAuth(req);
        return auth?.isAuthorized || false;
    }

    async getUser(req) {
        const auth = await verifyAzureADAuth(req);
        return auth?.user || null;
    }
}

let backend = null;

async function getBackend() {
    if (backend) return backend;

    const database = await getDatabase();
    const isLocal = process.env.TINA_PUBLIC_IS_LOCAL === 'true';

    backend = TinaNodeBackend({
        authentication: isLocal
            ? LocalBackendAuthentication()
            : new AzureADBackendAuthentication(),
        datalayer: {
            database
        }
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
