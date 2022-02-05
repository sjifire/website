// if (typeof window === 'undefined') window = {}

/* global DOMPurify */
window.NetlifyCmsEditorComponentFile = {
  label: "File",
  id: "file",
  fromBlock: (match) => {
    if (!match) return {};
    return {
      file: match[2],
      title: match[1],
    };
  },
  toBlock: function (obj) {
    const markdown = `[${obj.title}](${obj.file})`;
    return DOMPurify.sanitize(markdown);
    // return markdown;
  },
  toPreview: ({ file, title }, getAsset, fields) => {
    const fileField = fields?.find((f) => f.get("widget") === "file");
    const src = getAsset(file, fileField);
    return `<a src=${src || ""}>${title}</a>`;
  },
  pattern: /^\[(.+?)\]\((.+?\.(pdf|txt))\)$/im,
  fields: [
    {
      label: "File",
      name: "file",
      widget: "file",
      allow_multiple: false,
      choose_url: false,
      media_folder: "/src/assets/docs/",
      public_folder: "",
    },
    {
      label: "Title",
      name: "title",
      required: true,
    },
  ],
};
