const escapeHtml = require("escape-html");

/**
 * Render inline marks (bold, italic, etc.) around text content.
 */
function renderMarks(text, node) {
  let result = escapeHtml(text);
  if (node.code) result = `<code>${result}</code>`;
  if (node.bold) result = `<strong>${result}</strong>`;
  if (node.italic) result = `<em>${result}</em>`;
  if (node.underline) result = `<u>${result}</u>`;
  if (node.strikethrough) result = `<s>${result}</s>`;
  return result;
}

/**
 * Render a TinaCMS rich-text AST node to HTML.
 */
function renderNode(node, cloudinary) {
  if (!node) return "";

  // Text leaf node
  if (node.type === "text") {
    return renderMarks(node.text || "", node);
  }

  // Line break
  if (node.type === "break") {
    return "<br>";
  }

  // Horizontal rule
  if (node.type === "hr") {
    return "<hr>";
  }

  // Raw HTML
  if (node.type === "html" || node.type === "html_inline") {
    return node.value || "";
  }

  // Image
  if (node.type === "img") {
    const src = node.url || "";
    const alt = escapeHtml(node.alt || node.caption || "");
    return `<img src="${src}" alt="${alt}">`;
  }

  // Code block
  if (node.type === "code_block") {
    const lang = node.lang ? ` class="language-${escapeHtml(node.lang)}"` : "";
    const value = escapeHtml(node.value || "");
    return `<pre><code${lang}>${value}</code></pre>\n`;
  }

  // Custom MDX components (e.g., StyledImage)
  if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") {
    return renderComponent(node, cloudinary);
  }

  // Recursive children rendering
  const children = renderChildren(node.children, cloudinary);

  switch (node.type) {
    case "root":
      return children;
    case "p":
      return `<p>${children}</p>\n`;
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return `<${node.type}>${children}</${node.type}>\n`;
    case "blockquote":
      return `<blockquote>${children}</blockquote>\n`;
    case "ul":
      return `<ul>\n${children}</ul>\n`;
    case "ol":
      return `<ol>\n${children}</ol>\n`;
    case "li":
      return `<li>${children}</li>\n`;
    case "lic":
      return children;
    case "a":
      return `<a href="${escapeHtml(node.url || "")}">${children}</a>`;
    case "table":
      return `<table>\n${children}</table>\n`;
    case "tr":
      return `<tr>${children}</tr>\n`;
    case "td":
      return `<td>${children}</td>`;
    case "th":
      return `<th>${children}</th>`;
    default:
      return children;
  }
}

/**
 * Render an array of child nodes.
 */
function renderChildren(children, cloudinary) {
  if (!children || !Array.isArray(children)) return "";
  return children.map((child) => renderNode(child, cloudinary)).join("");
}

/**
 * Render a custom TinaCMS component (e.g., StyledImage).
 */
function renderComponent(node, cloudinary) {
  const name = node.name;
  const props = node.props || {};

  if (name === "StyledImage") {
    const ALLOWED_SIZES = ["small", "medium", "large", "full"];
    const ALLOWED_ALIGNS = ["left", "center", "right"];

    const src = props.src || "";
    const alt = escapeHtml(props.alt || "");
    const size = ALLOWED_SIZES.includes(props.size) ? props.size : "full";
    const align = ALLOWED_ALIGNS.includes(props.align) ? props.align : "center";

    const classes = `styled-image styled-image--${size} styled-image--${align}`;
    const optimizedSrc = cloudinary ? cloudinary.imgPath(src, "f_auto,q_auto:good") : src;
    return `<figure class="${classes}"><img src="${optimizedSrc}" alt="${alt}"><figcaption>${alt}</figcaption></figure>\n`;
  }

  // Unknown component: render children if any
  return renderChildren(node.children, cloudinary);
}

/**
 * Convert a TinaCMS rich-text AST (object) to HTML.
 */
function richTextToHtml(ast, cloudinary) {
  if (!ast) return "";
  return renderNode(ast, cloudinary);
}

module.exports = { richTextToHtml };
