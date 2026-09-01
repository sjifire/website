const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { normalizePost } = require("../_lib/post-data");
const { DateTime } = require("../_lib/date-utils");

const postsFolder = path.resolve(__dirname, "../posts");
const now = DateTime.now();

const posts = fs
  .readdirSync(postsFolder)
  .filter((name) => path.extname(name) === ".mdx")
  .map((name) => {
    const { data, content } = matter(
      fs.readFileSync(path.join(postsFolder, name), "utf8")
    );
    return normalizePost(data, content, name, now);
  })
  .sort((a, b) => {
    // Pinned posts come first, then sort by date
    if (a.pinned && !b.pinned) return 1;  // a after b (will be reversed)
    if (!a.pinned && b.pinned) return -1; // a before b (will be reversed)
    // Both pinned or both not pinned: sort by date
    return new Date(a.date) - new Date(b.date);
  });

module.exports = posts;
