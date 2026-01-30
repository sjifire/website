// Pull title and nav_order from the editable JSON config in _data/
export default {
  eleventyComputed: {
    title: (data) => data.ourTeamPage?.title,
    nav_order: (data) => data.ourTeamPage?.nav_order,
  },
};
