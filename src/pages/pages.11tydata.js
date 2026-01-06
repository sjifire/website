const isProduction = process.env.ELEVENTY_ENV === "production";

module.exports = {
	permalink: function (data) {
		// Respect explicit permalink: false in frontmatter
		if (data.permalink === false) {
			return false;
		}
		// Hide drafts in production
		if (data.draft && isProduction) {
			return false;
		}
		var url = data.page.filePathStem;
		//remove pages
		url = url.replace('/pages', '');
		//add index.html
		url = `${url}/index.${data.page.outputFileExtension}`;
		return url;
		// return `/recipes/${this.slugify(title)}`;
	},
	eleventyComputed: {
		layout: function (data) {
			// No layout for content-include files or explicit layout: false
			if (data.permalink === false || data.layout === false) {
				return false;
			}
			// Respect explicit layout in frontmatter
			if (data.layout) {
				return data.layout;
			}
			return "pages.njk";
		}
	}
};

