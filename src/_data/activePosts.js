// Active (non-archived) posts for use in paginated listings
const posts = require("./posts");

module.exports = posts.filter((p) => !p.archived);
