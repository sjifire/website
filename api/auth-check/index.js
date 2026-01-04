const jwt = require('jsonwebtoken');

module.exports = async function (context, req) {
    context.log('Auth check endpoint called');

    // Get the user principal from Azure Static Web Apps
    const header = req.headers['x-ms-client-principal'];

    if (!header) {
        context.res = {
            status: 401,
            body: { error: 'Not authenticated' }
        };
        return;
    }

    const encoded = Buffer.from(header, 'base64');
    const decoded = JSON.parse(encoded.toString('ascii'));

    // Check if user is in allowed groups
    const allowedGroups = process.env.ALLOWED_EDITOR_GROUPS?.split(',') || [];
    const userGroups = decoded.userRoles || [];

    const hasAccess = allowedGroups.some(group => userGroups.includes(group));

    if (!hasAccess) {
        context.res = {
            status: 403,
            body: { error: 'User not in allowed groups' }
        };
        return;
    }

    context.res = {
        status: 200,
        body: {
            userId: decoded.userId,
            userDetails: decoded.userDetails,
            userRoles: decoded.userRoles
        }
    };
};
