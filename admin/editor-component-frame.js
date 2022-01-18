window.NetlifyCmsEditorComponentFrame = {
 id:"frame",
 label: "Embedded frameborder",
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
 pattern: /{{< iframe link="(.*)" >}}/,
 fromBlock: function(match){
    return{
       link: match[1]
    };
 },
 toBlock: ({link}) =>
    `{{< iframe link="${link}" >}}`,

 toPreview: ({link}) => {
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
