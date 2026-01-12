require("dotenv").config({ path: require("path").resolve(__dirname, "../../../.env") });
const { createAppAuth } = require("@octokit/auth-app");

// Always use main branch for TinaCMS operations
const branch = "main";

// Generate a GitHub installation access token from App credentials
async function getGitHubToken() {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

  if (!appId || !privateKey || !installationId) {
    throw new Error(
      "GitHub App credentials required: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID"
    );
  }

  // Handle private key formatting (may be base64 encoded or have escaped newlines)
  let formattedKey = privateKey
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "")
    .replace(/^["']|["']$/g, "")
    .trim();

  if (!formattedKey.includes("-----BEGIN")) {
    formattedKey = Buffer.from(formattedKey, "base64").toString("utf8");
  }

  const auth = createAppAuth({
    appId,
    privateKey: formattedKey,
    installationId,
  });

  const { token } = await auth({ type: "installation" });
  return token;
}

function getGitHubConfig() {
  return {
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    branch,
  };
}

// Generic GitHub API request helper
async function githubRequest(endpoint, options = {}) {
  const token = await getGitHubToken();
  const { owner, repo } = getGitHubConfig();

  const url = `https://api.github.com/repos/${owner}/${repo}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub API error: ${response.status} - ${error}`);
  }

  return response.json();
}

module.exports = { getGitHubToken, getGitHubConfig, githubRequest };
