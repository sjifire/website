module.exports = {
	permalink: function (data) {
		var url = data.page.filePathStem;
		//remove pages
		url = url.replace('/pages', '');
		//add index.html
		url = `${url}/index.${data.page.outputFileExtension}`;
		return url;
		// return `/recipes/${this.slugify(title)}`;
	},
	layout: "pages.njk"
};

