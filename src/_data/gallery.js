const fs = require("fs");
const path = require("path");

const galleryFolder = path.resolve(__dirname, "../assets/media/gallery");

// Supported image extensions
const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

// Convert filename to readable alt text
function filenameToAlt(filename) {
  const name = path.basename(filename, path.extname(filename));
  return name
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const images = fs
  .readdirSync(galleryFolder)
  .filter((name) => {
    const ext = path.extname(name).toLowerCase();
    return imageExtensions.includes(ext);
  })
  .sort()
  .map((name) => ({
    src: `/assets/media/gallery/${name}`,
    alt: filenameToAlt(name),
  }));

module.exports = { images };
