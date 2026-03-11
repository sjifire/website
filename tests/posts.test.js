const { describe, it } = require("node:test");
const assert = require("node:assert");

describe("post archive logic", () => {
  // Replicate the archive logic from src/_data/posts.js
  const isArchived = (post) => {
    const now = new Date();
    return !!(post.archived_at && new Date(post.archived_at) <= now);
  };

  it("marks post as archived when archived_at is in the past", () => {
    const post = { archived_at: "2020-01-01T00:00:00.000Z" };
    assert.strictEqual(isArchived(post), true);
  });

  it("does not archive post when archived_at is in the future", () => {
    const post = { archived_at: "2099-01-01T00:00:00.000Z" };
    assert.strictEqual(isArchived(post), false);
  });

  it("does not archive post without archived_at", () => {
    const post = {};
    assert.strictEqual(isArchived(post), false);
  });

  it("does not archive post with null archived_at", () => {
    const post = { archived_at: null };
    assert.strictEqual(isArchived(post), false);
  });

  it("does not archive post with empty string archived_at", () => {
    const post = { archived_at: "" };
    assert.strictEqual(isArchived(post), false);
  });
});

describe("posts data loader", () => {
  it("loads posts and sets archived flag", () => {
    const posts = require("../src/_data/posts");
    assert.ok(Array.isArray(posts), "posts should be an array");
    assert.ok(posts.length > 0, "should have at least one post");

    for (const post of posts) {
      assert.strictEqual(typeof post.archived, "boolean", `post "${post.title}" should have boolean archived flag`);
      assert.ok(post.url, `post "${post.title}" should have a url`);
    }
  });

  it("splits into active and archived posts correctly", () => {
    const posts = require("../src/_data/posts");
    const activePosts = require("../src/_data/activePosts");
    const archivedPosts = require("../src/_data/archivedPosts");

    assert.strictEqual(
      activePosts.length + archivedPosts.length,
      posts.length,
      "active + archived should equal total posts"
    );

    for (const post of activePosts) {
      assert.strictEqual(post.archived, false, `active post "${post.title}" should not be archived`);
    }

    for (const post of archivedPosts) {
      assert.strictEqual(post.archived, true, `archived post "${post.title}" should be archived`);
    }
  });

  it("archived posts have archived_at dates in the past", () => {
    const archivedPosts = require("../src/_data/archivedPosts");
    const now = new Date();

    for (const post of archivedPosts) {
      assert.ok(post.archived_at, `archived post "${post.title}" should have archived_at`);
      assert.ok(new Date(post.archived_at) <= now, `archived post "${post.title}" archived_at should be in the past`);
    }
  });
});
