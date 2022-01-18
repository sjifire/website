window.NetlifyCmsEditorComponentFile = {
  label: 'File',
  id: 'file',
  fromBlock: match => {
    if(!match) return {};
    return {
      filePath: match[2],
      title: match[4]
    }
  },
  toBlock: function (obj) {
    markdown = `![''](${obj.filePath || ''}${obj.title ? ` "${obj.title.replace(/"/g, '\\"')}"` : ''})`;
    return markdown;
  },
  // eslint-disable-next-line react/display-name
  toPreview: ({ filePath, title }, getAsset, fields) => {
    const fileField = fields?.find(f => f.get('widget') === 'file');
    const src = getAsset(image, fileField);
    return `<a src=${src || ''}>${title}</a>`;
  },
  pattern: /^!\[(.*)\]\((.*?)(\s"(.*)")?\)\s*(\{(.+?)\})?$/m,
  fields: [
    {
      label: 'File',
      name: 'file',
      widget: 'file',
      allow_multiple: false,
      choose_url: false,
      media_folder: '/src/assets/docs/',
      public_folder: ''
    }
  ]
};
