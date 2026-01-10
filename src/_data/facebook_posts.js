/* global fetch */
const { DateTime } = require("luxon");

const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const FACEBOOK_ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN;
const FACEBOOK_API_VERSION = "v18.0";
const MAX_POSTS = 10;

/**
 * Fetches posts from the Facebook Graph API.
 * Returns empty array if credentials are missing or on error.
 */
async function fetchFacebookPosts() {
  if (!FACEBOOK_PAGE_ID || !FACEBOOK_ACCESS_TOKEN) {
    console.log("Facebook credentials not configured, skipping Facebook posts");
    return [];
  }

  const fields = "id,message,created_time,permalink_url,full_picture";
  const url = `https://graph.facebook.com/${FACEBOOK_API_VERSION}/${FACEBOOK_PAGE_ID}/posts?fields=${fields}&limit=${MAX_POSTS}&access_token=${FACEBOOK_ACCESS_TOKEN}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.text();
      console.warn("Facebook API error:", response.status, error);
      return [];
    }

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.warn("Facebook fetch error:", error.message);
    return [];
  }
}

/**
 * Extracts a title from a Facebook post message.
 * Uses first line if it's short enough, otherwise truncates.
 */
function extractTitle(message) {
  if (!message) return "Facebook Post";

  const firstLine = message.split("\n")[0].trim();
  if (firstLine.length <= 80) {
    return firstLine;
  }

  // Truncate at word boundary
  const truncated = firstLine.substring(0, 77).replace(/\s+\S*$/, "");
  return truncated + "...";
}

/**
 * Extracts a lede/summary from a Facebook post message.
 * Returns the full message truncated if needed.
 */
function extractLede(message) {
  if (!message) return "";

  if (message.length <= 200) {
    return message;
  }

  // Truncate at word boundary
  const truncated = message.substring(0, 197).replace(/\s+\S*$/, "");
  return truncated + "...";
}

/**
 * Transforms Facebook API post data into our standard post format.
 */
function transformPost(fbPost) {
  const date = DateTime.fromISO(fbPost.created_time, { zone: "utc" });

  return {
    post_type: "Facebook",
    date: date.toISO(),
    title: extractTitle(fbPost.message),
    lede: extractLede(fbPost.message),
    url: fbPost.permalink_url,
    external: true, // Flag to indicate this links externally
    featured_image: fbPost.full_picture
      ? {
          source: fbPost.full_picture,
          external: true,
        }
      : null,
    facebook_id: fbPost.id,
  };
}

module.exports = async function () {
  const fbPosts = await fetchFacebookPosts();

  return fbPosts
    .filter((post) => post.message) // Only posts with text content
    .map(transformPost)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
};
