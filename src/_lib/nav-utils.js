/**
 * Resolve the label shown on the highlighted header nav button.
 *
 * Editors set this in the Navigation pane in TinaCMS. When they leave it blank
 * we fall back to the linked page's own nav title, so the button keeps working
 * without the label having to be filled in.
 */
function resolveHighlightLabel(configLabel, pageInfo) {
  return configLabel?.trim() || pageInfo?.nav_title || pageInfo?.title || null;
}

/**
 * Build the highlighted nav entry from the Navigation config.
 *
 * `lookupPage` takes the configured URL and returns the linked page's info, or
 * null when no such page exists. A missing page hides the highlight entirely:
 * the button is the site's primary call to action, so failing to render is far
 * better than rendering a link to a 404.
 *
 * The result carries two labels. `label` is the call-to-action wording for the
 * header button; `nav_title` is the page's own name, which the footer uses so a
 * shouty button label doesn't leak into its plain list of links.
 */
function buildHeaderHighlight(url, configLabel, lookupPage) {
  if (!url) return null;

  const pageInfo = lookupPage(url);
  if (!pageInfo) return null;

  const label = resolveHighlightLabel(configLabel, pageInfo);
  if (!label) return null;

  return { ...pageInfo, label };
}

module.exports = { resolveHighlightLabel, buildHeaderHighlight };
