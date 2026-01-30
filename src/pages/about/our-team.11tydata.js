// Pull page config from the editable JSON in _data/
export default {
  eleventyComputed: {
    title: (data) => data.ourTeamPage?.title,
    nav_order: (data) => data.ourTeamPage?.nav_order,
    nav_title: (data) => data.ourTeamPage?.nav_title,
    nav_hidden: (data) => data.ourTeamPage?.nav_hidden,
  },
};
