// if (typeof window === 'undefined') window = {}

/* global DOMPurify */
window.NetlifyCmsEditorComponentFrame = {
  id: "frame",
  label: "Embedded Frame",
  fields: [
    {
      name: "link",
      label: "URL",
      widget: "string",
    },
    {
      name: "title",
      label: "Title",
      widget: "string",
    },
  ],
  pattern: /\[iframe link="(.+?)" title="(.+?)"\]/im,
  fromBlock: function (match) {
    return {
      link: match[1],
      title: match[2],
    };
  },
  toBlock: ({ link, title }) => {
    const markdown = `[iframe link="${link}" title="${title}"]`;
    return DOMPurify.sanitize(markdown);
  },
  toPreview: ({ link, title }) => {
    return `
  <figure class="post__media">
    <div class="embed-responsive embed-responsive-16by9">
      <iframe width='100%' height='640px' title="${title}" src="${{
      link,
    }}" loading="lazy" frameborder='0' scrolling='no' style="
      border:none;overflow:hidden' allowfullscreen="true" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe>
    </div>
    <figcaption>
      ${title}
    </figcaption>
  </figure>
   `;
  },
};
