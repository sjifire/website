const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { derivePostUrl } = require("../_lib/post-url");

const postsFolder = path.resolve(__dirname, "../posts");
const now = new Date();

const posts = fs
  .readdirSync(postsFolder)
  .filter((name) => path.extname(name) === ".mdx")
  .map((name) => {
    const { data, content } = matter(
      fs.readFileSync(path.join(postsFolder, name), "utf8")
    );
    // Resolved here, while the file name is to hand for the error message.
    return { ...data, body: content, url: derivePostUrl(data, name) };
  })
  .sort((a, b) => {
    // Pinned posts come first, then sort by date
    if (a.pinned && !b.pinned) return 1;  // a after b (will be reversed)
    if (!a.pinned && b.pinned) return -1; // a before b (will be reversed)
    // Both pinned or both not pinned: sort by date
    return new Date(a.date) - new Date(b.date);
  });

posts.forEach((p) => {
  p.archived = !!(p.archived_at && new Date(p.archived_at) <= now);
});

module.exports = posts;
