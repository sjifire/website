/* global DOMPurify */
window.NetlifyCmsEditorComponentYoutube = {
  id: "youtube",
  label: "YouTube",
  fields: [
    {
      name: "url",
      label: "Youtube video ID or URL",
      widget: "string",
    },
  ],
  pattern: /^@\[youtube\]\s*\((.+?)\)$/,
  fromBlock: function (match) {
    return {
      url: match[1],
    };
  },
  toBlock: function (obj) {
    return DOMPurify.sanitize("@[youtube](" + obj.url + ")");
  },
  toPreview: function (obj) {
    return DOMPurify.sanitize("@[youtube](" + obj.url + ")");
  },
};

window.NetlifyCmsEditorComponentVimeo = {
  id: "vimeo",
  label: "Vimeo",
  fields: [
    {
      name: "url",
      label: "Vimeo video ID or URL",
      widget: "string",
    },
  ],
  pattern: /^@\[vimeo\]\s*\((.+?)\)$/,
  fromBlock: function (match) {
    return {
      url: match[1],
    };
  },
  toBlock: function (obj) {
    return "@[vimeo](" + obj.url + ")";
  },
  toPreview: function (obj) {
    return "@[vimeo](" + obj.url + ")";
  },
};
