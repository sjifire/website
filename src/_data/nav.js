const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { resolveHighlightLabel } = require("../_lib/nav-utils");

const pagesDir = path.resolve(__dirname, "../pages");
const dataDir = __dirname;
const navigationJson = require("./navigation.json");
const navigationConfig = navigationJson.items;
const headerHighlightUrl = navigationJson.header_highlight_url;
const headerHighlightLabel = navigationJson.header_highlight_label;

// Check for a corresponding JSON config file in _data/ (e.g., ourTeamPage.json for our-team.liquid)
function getPageConfig(slug) {
  // Convert slug to camelCase + "Page" (e.g., "our-team" -> "ourTeamPage")
  const configName = slug.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) + "Page";
  const configPath = path.join(dataDir, configName + ".json");
  if (fs.existsSync(configPath)) {
    return require(configPath);
  }
  return null;
}

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

      // Check for JSON config file that overrides frontmatter
      const config = getPageConfig(slug);
      const title = config?.title || data.title;
      const nav_title = config?.nav_title || data.nav_title || title;
      const nav_order = config?.nav_order ?? data.nav_order ?? 999;
      const nav_hidden = config?.nav_hidden ?? data.nav_hidden ?? false;

      return {
        title,
        nav_title,
        nav_order,
        nav_hidden,
        url: `/${folder}/${slug}/`,
        label: nav_title,
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

  const extensions = [".mdx", ".liquid", ".md"];

  // Handle top-level pages (e.g., /join/)
  if (parts.length === 1) {
    const slug = parts[0];
    for (const ext of extensions) {
      const filePath = path.join(pagesDir, slug + ext);
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

  const folder = parts[0];
  const slug = parts[1];
  const folderPath = path.join(pagesDir, folder);

  // Find matching file
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

// Build highlight info. The label comes from the Navigation config when set, so
// editors can word the button independently of the linked page's title.
function getHeaderHighlight() {
  if (!headerHighlightUrl) return null;

  const pageInfo = getPageInfo(headerHighlightUrl);
  const label = resolveHighlightLabel(headerHighlightLabel, pageInfo);
  if (!label) return null;

  return { ...pageInfo, url: headerHighlightUrl, label };
}

const headerHighlight = getHeaderHighlight();

// Footer-only links
const footerLinks = navigationJson.footer_links || [];

module.exports = {
  items,
  headerHighlight,
  footerLinks,
};
