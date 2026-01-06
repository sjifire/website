const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const pagesDir = path.resolve(__dirname, "../pages");
const navigationConfig = require("./navigation.json").items;

// Read all MDX/NJK pages and extract frontmatter
function getPages(folder) {
  const folderPath = path.join(pagesDir, folder);
  if (!fs.existsSync(folderPath)) return [];

  return fs
    .readdirSync(folderPath)
    .filter((file) => /\.(mdx|njk|md)$/.test(file))
    .map((file) => {
      const filePath = path.join(folderPath, file);
      const content = fs.readFileSync(filePath, "utf8");
      const { data } = matter(content);
      const slug = file.replace(/\.(mdx|njk|md)$/, "");

      // Skip pages with permalink: false (content includes)
      if (data.permalink === false) return null;

      return {
        title: data.title,
        nav_title: data.nav_title || data.title,
        nav_order: data.nav_order ?? 999,
        nav_hidden: data.nav_hidden ?? false,
        url: `/${folder}/${slug}/`,
      };
    })
    .filter((page) => page && !page.nav_hidden)
    .sort((a, b) => a.nav_order - b.nav_order);
}

// Build navigation with auto-populated children
const nav = navigationConfig.map((item) => {
  if (item.folder) {
    return {
      label: item.label,
      folder: item.folder,
      children: getPages(item.folder),
    };
  }
  return item;
});

module.exports = nav;
