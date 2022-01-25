window.NetlifyCmsEditorComponentFile = {
  label: 'File',
  id: 'file',
  fromBlock: match => {
    if(!match) return {};
    return {
      file: match[2],
      title: match[1]
    }
  },
  toBlock: function (obj) {
    markdown = `[${obj.title.replace(/"/g, '\\"')}](${obj.file})`;
    return markdown;
  },
  // eslint-disable-next-line react/display-name
  toPreview: ({ file, title }, getAsset, fields) => {
    const fileField = fields?.find(f => f.get('widget') === 'file');
    const src = getAsset(image, fileField);
    return `<a src=${src || ''}>${title}</a>`;
  },
  pattern: /^\[(.+?)\]\((.+?\.(pdf|txt))\)$/mi,
  fields: [
    {
      label: 'File',
      name: 'file',
      widget: 'file',
      allow_multiple: false,
      choose_url: false,
      media_folder: '/src/assets/docs/',
      public_folder: ''
    },
    {
      label: 'Title',
      name: 'title',
      required: true
    }
  ]
};
