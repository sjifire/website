const fs = require("fs");
const path = require("path");

const meetingsFolder = path.resolve(__dirname, "../meetings");

const meetings = fs
  .readdirSync(meetingsFolder)
  .filter((name) => path.extname(name) === ".json")
  .map((name) => ({
    year: path.parse(name).name.slice(0, 4),
    ...require(path.join(meetingsFolder, name)),
  }));

module.exports = meetings;
