const fs = require("fs");
const path = require("path");

const postsFolder = path.resolve(__dirname, "../posts");

const posts = fs
  .readdirSync(postsFolder)
  .filter(name => path.extname(name) === ".json")
  .map(name => ({
    ...require(path.join(postsFolder, name)),
  }));

module.exports = posts;