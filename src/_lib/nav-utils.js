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
 * Resolve the plain link text for the highlighted page, used where it appears
 * in an ordinary list of links rather than as a call-to-action button (the
 * footer). This is the page's own name, so a shouty button label like
 * "APPLY NOW FOR OUR 2027 ACADEMY" doesn't leak into the footer.
 */
function resolvePageLabel(pageInfo, highlightLabel) {
  return pageInfo?.nav_title || pageInfo?.title || highlightLabel || null;
}

module.exports = { resolveHighlightLabel, resolvePageLabel };
