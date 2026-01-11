const posts = require("./posts.js");
const facebookPosts = require("./facebook_posts.js");

/**
 * Combined feed of posts and Facebook posts, sorted by date (newest first when reversed).
 * This allows the homepage to show an intermingled chronological feed.
 */
module.exports = async function () {
  // facebook_posts.js exports an async function
  const fbPosts = await facebookPosts();

  // Merge both arrays
  const allPosts = [...posts, ...fbPosts];

  // Sort by date ascending (will be reversed in template for newest first)
  return allPosts.sort((a, b) => new Date(a.date) - new Date(b.date));
};
