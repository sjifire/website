const fs = require("fs");
const path = require("path");
const slugify = require("slugify");
const { DateTime } = require("luxon");

const postsFolder = path.resolve(__dirname, "../posts");

const posts = fs
  .readdirSync(postsFolder)
  .filter((name) => path.extname(name) === ".json")
  .map((name) => ({
    ...require(path.join(postsFolder, name)),
  }))
  .sort((a, b) => {
    // Pinned posts come first, then sort by date
    if (a.pinned && !b.pinned) return 1;  // a after b (will be reversed)
    if (!a.pinned && b.pinned) return -1; // a before b (will be reversed)
    // Both pinned or both not pinned: sort by date
    return new Date(a.date) - new Date(b.date);
  });

//FIXME: standardize slugify... can we set global configs?
posts.forEach((p) => {
  let urlDate = DateTime.fromISO(p.date, { zone: "utc" }).toFormat(
    "yyyy-LL-dd"
  );
  let titleSlug = slugify(p.title, {
    lower: true,
    replacement: "-",
    strict: true,
  });
  p.url = `/news/${urlDate}-${titleSlug}`;
});

module.exports = posts;
