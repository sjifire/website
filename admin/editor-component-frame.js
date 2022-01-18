window.NetlifyCmsEditorComponentFrame = {
 id:"frame",
 label: "Embedded Frame",
 fields:[
  {
    name: "link",
    label: "URL",
    widget: "string"
  },
  {
    name: "title",
    label: "Title",
    widget: "string"
  }],
 pattern: /{{< iframe link="(.+?)" title="(.+?)" >}}/,
 fromBlock: function(match){
    return{
       link: match[1],
       title: match[2]
    };
 },
 toBlock: ({link, title}) =>
    `{{< iframe link="${link}" title="${title}">}}`,

 toPreview: ({link, title}) => {
  return `
  <figure class="post__media">
    <div class="embed-responsive embed-responsive-16by9">
      <iframe width='100%' height='640px' title="${title}" src="${{url}}" loading="lazy" frameborder='0' scrolling='no' style="
      border:none;overflow:hidden' allowfullscreen="true" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe>
    </div>
    <figcaption>
      ${title}
    </figcaption>
  </figure>
   `
 }
}
