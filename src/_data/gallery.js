const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const site = require("./site.json");
const homepage = require("./homepage.json");

// Configuration from site.json (folder path) and homepage.json (carousel count)
const folderPath = site.gallery_folder || "src/assets/media/gallery";
const carouselCount = homepage.carousel?.image_count || 5;

// Resolve folder path from project root
const projectRoot = path.resolve(__dirname, "../..");
const galleryFolder = path.resolve(projectRoot, folderPath);

// Derive web path (strip "src" prefix for URL)
const webPath = "/" + folderPath.replace(/^src\//, "");

// Supported image extensions
const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

// Per-image photo credits (keyed by filename)
const photoCredits = {
  "training_at_s31.jpg": "Monico Mackinnon",
  "lt_salinas_photo_bombing_during_training.jpg": "Monico Mackinnon",
};

// Convert filename to readable alt text with Title Case
function filenameToAlt(filename) {
  const name = path.basename(filename, path.extname(filename));
  return name
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bSjifr\b/g, "SJIFR"); // Handle acronym
}

// Hash string using crypto for stable pseudo-random ordering
function hashString(str) {
  return crypto.createHash("md5").update(str).digest("hex");
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
    .sort((a, b) => hashString(a).localeCompare(hashString(b))) // Stable pseudo-random order
    .map((name) => ({
      src: `${webPath}/${name}`,
      alt: filenameToAlt(name),
      credit: photoCredits[name] || null,
    }));
}

// Random images for homepage carousel (shuffled at build time)
const carouselImages = shuffle(images).slice(0, carouselCount);

module.exports = { images, carouselImages };
