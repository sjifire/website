const fs = require("fs");
const path = require("path");
const slugify = require("slugify");
const { DateTime } = require("luxon");

// Convert TinaCMS rich-text AST node to markdown string
function astToMarkdown(node) {
  if (!node) return "";
  if (node.type === "text") {
    let t = node.text || "";
    if (node.bold) t = `**${t}**`;
    if (node.italic) t = `*${t}*`;
    if (node.strikethrough) t = `~~${t}~~`;
    if (node.code) t = `\`${t}\``;
    return t;
  }
  if (node.type === "break") return "  \n";
  if (node.type === "hr") return "\n---\n";
  if (node.type === "img") return `![${node.alt || ""}](${node.url || ""})`;
  if (node.type === "code_block") return `\n\`\`\`${node.lang || ""}\n${node.value || ""}\n\`\`\`\n`;

  // StyledImage component embedded via rich-text
  if ((node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") && node.name === "StyledImage") {
    const p = node.props || {};
    return `<StyledImage src="${p.src || ""}" alt="${p.alt || ""}" size="${p.size || "full"}" align="${p.align || "center"}" />\n`;
  }

  const kids = (node.children || []).map(astToMarkdown).join("");
  const h = { h1: "#", h2: "##", h3: "###", h4: "####", h5: "#####", h6: "######" };
  if (h[node.type]) return `\n${h[node.type]} ${kids}\n`;
  if (node.type === "p") return `\n${kids}\n`;
  if (node.type === "blockquote") return `\n> ${kids.trim().replace(/\n/g, "\n> ")}\n`;
  if (node.type === "ul" || node.type === "ol") return `\n${kids}`;
  if (node.type === "li") return `- ${kids.trim()}\n`;
  if (node.type === "lic") return kids;
  if (node.type === "a") return `[${kids}](${node.url || ""})`;
  return kids;
}

const postsFolder = path.resolve(__dirname, "../posts");

const posts = fs
  .readdirSync(postsFolder)
  .filter((name) => path.extname(name) === ".json")
  .map((name) => {
    const post = { ...require(path.join(postsFolder, name)) };
    // Convert rich-text AST body to markdown string for markdownify filter
    if (post.body && typeof post.body === "object") {
      post.body = astToMarkdown(post.body).trim();
    }
    return post;
  })
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
