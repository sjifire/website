/**
 * Custom GitHub Git Provider with commit author attribution
 *
 * This extends the standard tinacms-gitprovider-github to add author/committer
 * information to commits based on the authenticated user making the change.
 *
 * Uses AsyncLocalStorage to pass user context through the TinaCMS data layer
 * without modifying the GitHubProvider interface.
 */

const { AsyncLocalStorage } = require("node:async_hooks");
const { Octokit } = require("@octokit/rest");

// AsyncLocalStorage instance for request-scoped author context
const authorContext = new AsyncLocalStorage();

/**
 * Run a function with author context available
 * @param {{name: string, email: string}} author - Git author info
 * @param {Function} fn - Function to run with context
 * @returns {Promise<any>} Result of fn
 */
function runWithAuthor(author, fn) {
  return authorContext.run(author, fn);
}

/**
 * Get the current author context (if any)
 * @returns {{name: string, email: string} | undefined}
 */
function getAuthorContext() {
  return authorContext.getStore();
}

/**
 * Custom GitHub provider that adds author info to commits
 */
class AuthoredGitHubProvider {
  constructor(options) {
    this.owner = options.owner;
    this.repo = options.repo;
    this.branch = options.branch;
    this.token = options.token;
    this.commitMessage = options.commitMessage || "Edited with TinaCMS";
    this.rootPath = options.rootPath || "";

    this.octokit = new Octokit({
      auth: this.token,
      ...options.octokitOptions,
    });
  }

  /**
   * Get the full path for a file (with optional root path prefix)
   */
  getFilePath(key) {
    if (this.rootPath) {
      return `${this.rootPath}/${key}`.replace(/\/+/g, "/");
    }
    return key;
  }

  /**
   * Build commit author info, including the authenticated user if available
   */
  getCommitInfo() {
    const author = getAuthorContext();

    // Build commit message with author attribution
    let message = this.commitMessage;
    if (author?.email) {
      message = `${this.commitMessage} by ${author.email}`;
    }

    const result = { message };

    // Add author/committer to the commit if we have user context
    if (author) {
      result.author = {
        name: author.name,
        email: author.email,
      };
      result.committer = {
        name: author.name,
        email: author.email,
      };
    }

    return result;
  }

  /**
   * Create or update a file
   */
  async onPut(key, value) {
    const path = this.getFilePath(key);
    const commitInfo = this.getCommitInfo();

    // Check if file exists to get SHA for update
    let sha;
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref: this.branch,
      });
      sha = data.sha;
    } catch (e) {
      // File doesn't exist, that's fine for create
      if (e.status !== 404) {
        throw e;
      }
    }

    await this.octokit.repos.createOrUpdateFileContents({
      owner: this.owner,
      repo: this.repo,
      path,
      message: commitInfo.message,
      content: Buffer.from(value).toString("base64"),
      branch: this.branch,
      sha,
      author: commitInfo.author,
      committer: commitInfo.committer,
    });
  }

  /**
   * Delete a file
   */
  async onDelete(key) {
    const path = this.getFilePath(key);
    const commitInfo = this.getCommitInfo();

    // Get file SHA (required for delete)
    const { data } = await this.octokit.repos.getContent({
      owner: this.owner,
      repo: this.repo,
      path,
      ref: this.branch,
    });

    await this.octokit.repos.deleteFile({
      owner: this.owner,
      repo: this.repo,
      path,
      message: commitInfo.message,
      sha: data.sha,
      branch: this.branch,
      author: commitInfo.author,
      committer: commitInfo.committer,
    });
  }
}

module.exports = {
  AuthoredGitHubProvider,
  runWithAuthor,
  getAuthorContext,
};
