const fs = require("fs");
const path = require("path");

const mediaReleasesFolder = path.resolve(__dirname, "../media_releases");

const media_releases = fs
  .readdirSync(mediaReleasesFolder)
  .filter((name) => path.extname(name) === ".json")
  .map((name) => ({
    year: path.parse(name).name.slice(0, 4),
    ...require(path.join(mediaReleasesFolder, name)),
  }));

module.exports = media_releases;
