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

module.exports = { resolveHighlightLabel };
