const { Octokit } = require('@octokit/rest');

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
});

const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;
const mediaPath = 'src/images';

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
    context.log('GitHub media endpoint called');

    const user = await verifyAuth(req);
    if (!user) {
        context.res = {
            status: 403,
            body: { error: 'Access denied' }
        };
        return;
    }

    if (req.method === 'GET') {
        // List media files
        try {
            const { data } = await octokit.repos.getContent({
                owner,
                repo,
                path: mediaPath,
            });

            const files = data
                .filter(item => item.type === 'file')
                .map(item => ({
                    name: item.name,
                    path: item.path,
                    url: item.download_url,
                    size: item.size
                }));

            context.res = {
                status: 200,
                body: { files }
            };
        } catch (error) {
            context.log.error('Error listing media:', error);
            context.res = {
                status: 500,
                body: { error: 'Failed to list media files' }
            };
        }
    } else if (req.method === 'POST') {
        // Upload media file
        const { filename, content, contentType } = req.body;

        if (!filename || !content) {
            context.res = {
                status: 400,
                body: { error: 'Filename and content required' }
            };
            return;
        }

        try {
            const path = `${mediaPath}/${filename}`;
            const authorName = user.userDetails || user.userId || 'CMS User';

            // Check if file exists
            let sha;
            try {
                const existing = await octokit.repos.getContent({
                    owner,
                    repo,
                    path,
                });
                sha = existing.data.sha;
            } catch (error) {
                // File doesn't exist, that's fine
            }

            const result = await octokit.repos.createOrUpdateFileContents({
                owner,
                repo,
                path,
                message: `Upload ${filename} via CMS`,
                content: content, // Should already be base64
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
                    path: path,
                    url: result.data.content.download_url
                }
            };
        } catch (error) {
            context.log.error('Error uploading media:', error);
            context.res = {
                status: 500,
                body: { error: 'Failed to upload media file' }
            };
        }
    }
};
