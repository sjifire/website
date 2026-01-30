// Pull page config from the editable JSON in _data/
const ourTeamPage = require("../../_data/ourTeamPage.json");

module.exports = {
  title: ourTeamPage.title,
  nav_order: ourTeamPage.nav_order,
  nav_title: ourTeamPage.nav_title,
  nav_hidden: ourTeamPage.nav_hidden,
};
