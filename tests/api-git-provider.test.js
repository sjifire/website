const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert");

const {
  AuthoredGitHubProvider,
  runWithAuthor,
  getAuthorContext,
} = require("../api/src/lib/git-provider.js");

describe("git-provider module", () => {
  describe("runWithAuthor / getAuthorContext", () => {
    it("makes author context available within callback", async () => {
      const author = { name: "Jane Doe", email: "jane@example.com" };
      let capturedContext = null;

      await runWithAuthor(author, async () => {
        capturedContext = getAuthorContext();
      });

      assert.deepStrictEqual(capturedContext, author);
    });

    it("returns undefined outside of runWithAuthor context", () => {
      const context = getAuthorContext();
      assert.strictEqual(context, undefined);
    });

    it("isolates context between concurrent calls", async () => {
      const author1 = { name: "User One", email: "one@example.com" };
      const author2 = { name: "User Two", email: "two@example.com" };
      const results = [];

      await Promise.all([
        runWithAuthor(author1, async () => {
          // Small delay to interleave execution
          await new Promise((r) => setTimeout(r, 10));
          results.push({ expected: author1, actual: getAuthorContext() });
        }),
        runWithAuthor(author2, async () => {
          await new Promise((r) => setTimeout(r, 5));
          results.push({ expected: author2, actual: getAuthorContext() });
        }),
      ]);

      for (const { expected, actual } of results) {
        assert.deepStrictEqual(actual, expected);
      }
    });

    it("handles null author context", async () => {
      let capturedContext = "not-set";

      await runWithAuthor(null, async () => {
        capturedContext = getAuthorContext();
      });

      assert.strictEqual(capturedContext, null);
    });

    it("returns callback result", async () => {
      const result = await runWithAuthor({ name: "Test", email: "test@test.com" }, async () => {
        return { success: true, data: "test" };
      });

      assert.deepStrictEqual(result, { success: true, data: "test" });
    });

    it("propagates errors from callback", async () => {
      await assert.rejects(
        runWithAuthor({ name: "Test", email: "test@test.com" }, async () => {
          throw new Error("Test error");
        }),
        /Test error/
      );
    });
  });

  describe("AuthoredGitHubProvider", () => {
    describe("constructor", () => {
      it("stores configuration options", () => {
        const provider = new AuthoredGitHubProvider({
          owner: "test-owner",
          repo: "test-repo",
          branch: "main",
          token: "test-token",
        });

        assert.strictEqual(provider.owner, "test-owner");
        assert.strictEqual(provider.repo, "test-repo");
        assert.strictEqual(provider.branch, "main");
      });

      it("uses default commit message when not provided", () => {
        const provider = new AuthoredGitHubProvider({
          owner: "test-owner",
          repo: "test-repo",
          branch: "main",
          token: "test-token",
        });

        assert.strictEqual(provider.commitMessage, "Edited with TinaCMS");
      });

      it("accepts custom commit message", () => {
        const provider = new AuthoredGitHubProvider({
          owner: "test-owner",
          repo: "test-repo",
          branch: "main",
          token: "test-token",
          commitMessage: "Custom commit message",
        });

        assert.strictEqual(provider.commitMessage, "Custom commit message");
      });

      it("accepts optional rootPath", () => {
        const provider = new AuthoredGitHubProvider({
          owner: "test-owner",
          repo: "test-repo",
          branch: "main",
          token: "test-token",
          rootPath: "content",
        });

        assert.strictEqual(provider.rootPath, "content");
      });

      it("defaults rootPath to empty string", () => {
        const provider = new AuthoredGitHubProvider({
          owner: "test-owner",
          repo: "test-repo",
          branch: "main",
          token: "test-token",
        });

        assert.strictEqual(provider.rootPath, "");
      });
    });

    describe("getFilePath", () => {
      it("returns key as-is when no rootPath", () => {
        const provider = new AuthoredGitHubProvider({
          owner: "test-owner",
          repo: "test-repo",
          branch: "main",
          token: "test-token",
        });

        assert.strictEqual(provider.getFilePath("path/to/file.json"), "path/to/file.json");
      });

      it("prepends rootPath when set", () => {
        const provider = new AuthoredGitHubProvider({
          owner: "test-owner",
          repo: "test-repo",
          branch: "main",
          token: "test-token",
          rootPath: "content",
        });

        assert.strictEqual(provider.getFilePath("posts/hello.json"), "content/posts/hello.json");
      });

      it("normalizes multiple slashes", () => {
        const provider = new AuthoredGitHubProvider({
          owner: "test-owner",
          repo: "test-repo",
          branch: "main",
          token: "test-token",
          rootPath: "content/",
        });

        assert.strictEqual(provider.getFilePath("/posts/hello.json"), "content/posts/hello.json");
      });
    });

    describe("getCommitInfo", () => {
      it("returns message without author when no context", () => {
        const provider = new AuthoredGitHubProvider({
          owner: "test-owner",
          repo: "test-repo",
          branch: "main",
          token: "test-token",
        });

        const info = provider.getCommitInfo();

        assert.strictEqual(info.message, "Edited with TinaCMS");
        assert.strictEqual(info.author, undefined);
        assert.strictEqual(info.committer, undefined);
      });

      it("includes author info when context is set", async () => {
        const provider = new AuthoredGitHubProvider({
          owner: "test-owner",
          repo: "test-repo",
          branch: "main",
          token: "test-token",
        });

        const author = { name: "Jane Doe", email: "jane@sjifire.org" };

        await runWithAuthor(author, async () => {
          const info = provider.getCommitInfo();

          assert.strictEqual(info.message, "Edited with TinaCMS by jane@sjifire.org");
          assert.deepStrictEqual(info.author, { name: "Jane Doe", email: "jane@sjifire.org" });
          assert.deepStrictEqual(info.committer, { name: "Jane Doe", email: "jane@sjifire.org" });
        });
      });

      it("appends email to custom commit message", async () => {
        const provider = new AuthoredGitHubProvider({
          owner: "test-owner",
          repo: "test-repo",
          branch: "main",
          token: "test-token",
          commitMessage: "Content updated",
        });

        const author = { name: "John Smith", email: "john@example.com" };

        await runWithAuthor(author, async () => {
          const info = provider.getCommitInfo();

          assert.strictEqual(info.message, "Content updated by john@example.com");
        });
      });

      it("handles author with name but no email gracefully", async () => {
        const provider = new AuthoredGitHubProvider({
          owner: "test-owner",
          repo: "test-repo",
          branch: "main",
          token: "test-token",
        });

        const author = { name: "Anonymous User", email: "" };

        await runWithAuthor(author, async () => {
          const info = provider.getCommitInfo();

          // No email appended when email is empty
          assert.strictEqual(info.message, "Edited with TinaCMS");
          // Author info still included
          assert.deepStrictEqual(info.author, { name: "Anonymous User", email: "" });
        });
      });
    });
  });
});
