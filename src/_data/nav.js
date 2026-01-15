const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const pagesDir = path.resolve(__dirname, "../pages");
const navigationJson = require("./navigation.json");
const navigationConfig = navigationJson.items;
const headerHighlightUrl = navigationJson.header_highlight_url;

// Read all MDX/Liquid/MD pages and extract frontmatter
function getPages(folder) {
  const folderPath = path.join(pagesDir, folder);
  if (!fs.existsSync(folderPath)) return [];

  return fs
    .readdirSync(folderPath)
    .filter((file) => /\.(mdx|liquid|md)$/.test(file))
    .map((file) => {
      const filePath = path.join(folderPath, file);
      const content = fs.readFileSync(filePath, "utf8");
      const { data } = matter(content);
      const slug = file.replace(/\.(mdx|liquid|md)$/, "");

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

// Get page info from URL
function getPageInfo(url) {
  if (!url) return null;

  // Parse URL to get folder and slug (e.g., /about/join/ -> about, join)
  const parts = url.replace(/^\/|\/$/g, "").split("/");
  if (parts.length < 2) return null;

  const folder = parts[0];
  const slug = parts[1];
  const folderPath = path.join(pagesDir, folder);

  // Find matching file
  const extensions = [".mdx", ".liquid", ".md"];
  for (const ext of extensions) {
    const filePath = path.join(folderPath, slug + ext);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      const { data } = matter(content);
      return {
        title: data.title,
        nav_title: data.nav_title || data.title,
        url: url,
      };
    }
  }
  return null;
}

// Build navigation with auto-populated children
const items = navigationConfig.map((item) => {
  if (item.folder) {
    return {
      label: item.label,
      folder: item.folder,
      children: getPages(item.folder),
    };
  }
  return item;
});

// Build highlight info
const headerHighlight = headerHighlightUrl ? getPageInfo(headerHighlightUrl) : null;

module.exports = {
  items,
  headerHighlight,
};
