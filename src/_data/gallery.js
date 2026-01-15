const fs = require("fs");
const path = require("path");
const site = require("./site.json");
const homepage = require("./homepage.json");

// Configuration from site.json (folder path) and homepage.json (carousel count)
const config = site.gallery || {};
const folderPath = config.folder || "src/assets/media/gallery";
const carouselCount = homepage.carousel?.image_count || 5;

// Resolve folder path from project root
const projectRoot = path.resolve(__dirname, "../..");
const galleryFolder = path.resolve(projectRoot, folderPath);

// Derive web path (strip "src" prefix for URL)
const webPath = "/" + folderPath.replace(/^src\//, "");

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

// Fisher-Yates shuffle for carousel selection
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Read and process images if folder exists
let images = [];
if (fs.existsSync(galleryFolder)) {
  images = fs
    .readdirSync(galleryFolder)
    .filter((name) => {
      const ext = path.extname(name).toLowerCase();
      return imageExtensions.includes(ext);
    })
    .sort()
    .map((name) => ({
      src: `${webPath}/${name}`,
      alt: filenameToAlt(name),
    }));
}

// Random images for homepage carousel (shuffled at build time)
const carouselImages = shuffle(images).slice(0, carouselCount);

module.exports = { images, carouselImages };
