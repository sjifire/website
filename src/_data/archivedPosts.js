// Archived posts for the archive browse page
const posts = require("./posts");

module.exports = posts.filter((p) => p.archived);
