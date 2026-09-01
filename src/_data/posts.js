const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { derivePostUrl } = require("../_lib/post-url");
const { toDateTime } = require("../_lib/date-utils");

const postsFolder = path.resolve(__dirname, "../posts");
const now = new Date();

const posts = fs
  .readdirSync(postsFolder)
  .filter((name) => path.extname(name) === ".mdx")
  .map((name) => {
    const { data, content } = matter(
      fs.readFileSync(path.join(postsFolder, name), "utf8")
    );
    // Tina writes dates unquoted, so gray-matter yields a Date; the older posts
    // quote theirs, so they stay strings. Normalized to ISO once, here, so no
    // consumer ever sees the mixed type — LiquidJS's `sort: "date"` in
    // feed.liquid was comparing the two kinds and scrambling the feed order.
    // An unparseable value is left as-is for derivePostUrl to report.
    const date = toDateTime(data.date);
    const post = { ...data, date: date.isValid ? date.toISO() : data.date };
    // Only when the post has one, so posts without an archive date keep no key
    // at all rather than gaining an explicit undefined.
    if (data.archived_at) {
      const archivedAt = toDateTime(data.archived_at);
      post.archived_at = archivedAt.isValid ? archivedAt.toISO() : data.archived_at;
    }
    return { ...post, body: content, url: derivePostUrl(post, name) };
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
