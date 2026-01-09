const { Octokit } = require('@octokit/rest');

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
});

const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;

async function verifyAuth(req) {
    const header = req.headers['x-ms-client-principal'];
    if (!header) return null;

    const encoded = Buffer.from(header, 'base64');
    const decoded = JSON.parse(encoded.toString('ascii'));

    const allowedGroups = process.env.ALLOWED_EDITOR_GROUPS?.split(',') || [];
    const userGroups = decoded.userRoles || [];
    const hasAccess = allowedGroups.some(group => userGroups.includes(group));

    return hasAccess ? decoded : null;
}

module.exports = async function (context, req) {
    context.log('GitHub content endpoint called');

    // Verify authentication
    const user = await verifyAuth(req);
    if (!user) {
        context.res = {
            status: 403,
            body: { error: 'Access denied' }
        };
        return;
    }

    if (req.method === 'GET') {
        // Get file content
        const path = req.query.path;

        if (!path) {
            context.res = {
                status: 400,
                body: { error: 'Path parameter required' }
            };
            return;
        }

        try {
            const { data } = await octokit.repos.getContent({
                owner,
                repo,
                path,
            });

            const content = Buffer.from(data.content, 'base64').toString('utf-8');

            context.res = {
                status: 200,
                body: {
                    content,
                    sha: data.sha,
                    path: data.path
                }
            };
        } catch (error) {
            context.log.error('Error fetching content:', error);
            context.res = {
                status: 500,
                body: { error: 'Failed to fetch content' }
            };
        }
    } else if (req.method === 'POST') {
        // Update file content
        const { path, content, sha, message } = req.body;

        if (!path || !content) {
            context.res = {
                status: 400,
                body: { error: 'Path and content required' }
            };
            return;
        }

        try {
            const commitMessage = message || `Update ${path} via CMS`;
            const authorName = user.userDetails || user.userId || 'CMS User';

            const result = await octokit.repos.createOrUpdateFileContents({
                owner,
                repo,
                path,
                message: commitMessage,
                content: Buffer.from(content).toString('base64'),
                sha: sha,
                author: {
                    name: authorName,
                    email: `${user.userId}@cms.local`
                },
                committer: {
                    name: 'CMS Bot',
                    email: 'cms-bot@yourdomain.com'
                }
            });

            context.res = {
                status: 200,
                body: {
                    success: true,
                    commit: result.data.commit.sha
                }
            };
        } catch (error) {
            context.log.error('Error updating content:', error);
            context.res = {
                status: 500,
                body: { error: 'Failed to update content' }
            };
        }
    }
};
