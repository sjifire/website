/*
 * this is pretty brittle; it ONLY works with
 *  - one class style
 *  - width and height attributes
 *
 * if we want to do more, like mulitple classes, or preserve other attributes
 * this logic will need to expand.  If you want to see how complex parsing and handling
 * markdown-attrs can be, check out https://github.com/arve0/markdown-it-attrs
 *
 * WISHLIST:
 *  - if someone manually modifies the raw markdown, with other attributes...
 *    don't drop them, but hold onto them and pass them along to the raw markdown
 *
 */

/* global DOMPurify */
window.NetlifyCmsEditorComponentImage = {
  label: "Image",
  id: "image",
  fromBlock: (match) => {
    if (!match) return {};
    let width = null;
    let height = null;
    let klass = null;
    const markdownAttrs = match[6];
    if (markdownAttrs) {
      // klasses = [...attrs.matchAll(/\.[^\s]+/g)]
      let subMatches = markdownAttrs.match(/\.([^\s]+)/);
      if (subMatches) klass = subMatches[1];
      subMatches = markdownAttrs.match(/width=([^\s]+)/);
      if (subMatches) width = subMatches[1];
      subMatches = markdownAttrs.match(/height=([^\s]+)/);
      if (subMatches) height = subMatches[1];
    }
    return {
      image: match[2],
      alt: match[1],
      title: match[4],
      klass: klass,
      width: width,
      height: height,
    };
  },
  toBlock: function (obj) {
    let markdown = `![${obj.alt || ""}](${obj.image || ""}${
      obj.title ? ` "${obj.title}"` : ""
    })`;
    if (obj.klass || obj.height || obj.width) {
      markdown += `{${obj.klass ? "." + obj.klass : ""} ${
        obj.width ? "width=" + obj.width : ""
      } ${obj.height ? "height=" + obj.height : ""}`;
      markdown = markdown.trim() + "}";
    }
    return DOMPurify.sanitize(markdown);
  },
  toPreview: (
    { alt, image, title, width, height, klass },
    getAsset,
    fields
  ) => {
    const imageField = fields?.find((f) => f.get("widget") === "image");
    const src = getAsset(image, imageField);
    return `<img src=${src || ""} alt=${alt || ""} title=${title || ""} class=${
      klass || ""
    } width=${width || ""} height=${height || ""} />`;
  },
  pattern: /^!\[(.*)\]\((.*?)(\s"(.*)")?\)\s*(\{(.+?)\})?$/m,
  fields: [
    {
      label: "Image",
      name: "image",
      widget: "image",
      media_library: {
        allow_multiple: false,
      },
    },
    {
      label: "Image Scaling",
      name: "klass",
      widget: "select",
      options: [
        { label: "Scale to Small Image", value: "small_img" },
        { label: "Scale to Medium Image", value: "med_img" },
        { label: "Scale to Large Image", value: "large_img" },
      ],
    },
    {
      label: "Alt Text",
      name: "alt",
      required: true,
    },
    {
      label: "Title",
      name: "title",
      required: true,
    },
  ],
};
