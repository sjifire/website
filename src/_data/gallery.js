const fs = require("fs");
const path = require("path");
const site = require("./site.json");

// Configuration from site.json with defaults
const config = site.gallery || {};
const folderName = config.folder || "gallery";
const carouselCount = config.carouselCount || 5;

const galleryFolder = path.resolve(__dirname, `../assets/media/${folderName}`);

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
      src: `/assets/media/${folderName}/${name}`,
      alt: filenameToAlt(name),
    }));
}

// Random images for homepage carousel (shuffled at build time)
const carouselImages = shuffle(images).slice(0, carouselCount);

module.exports = { images, carouselImages };
