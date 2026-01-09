require("dotenv").config({ path: require("path").resolve(__dirname, "../../../.env") });
const { createAppAuth } = require("@octokit/auth-app");

const branch =
  process.env.GITHUB_BRANCH ||
  process.env.HEAD ||
  "main";

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

module.exports = { getGitHubToken, getGitHubConfig };
