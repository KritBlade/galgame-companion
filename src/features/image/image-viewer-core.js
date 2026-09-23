// galgame-companion · image-viewer-core — which backdrop galgame is showing, read off its layers. v0.1
//
// galgame v2.2 writes every backdrop as the CSS variable `--gal-bg-url` on the layer's INLINE style
// (galgame src/db/image-packs.js setBgLayerUrl), never as an inline background-image: its "avoid the
// dialog" fill mode draws the one image twice, in ::before (the blurred fill) and ::after (the fitted
// image), and in that mode the layer's own background-image is `none`. The variable is the one place
// the URL sits in every fill mode — galgame's own save thumbnail reads it for the same reason.
//
// Pure: the caller hands in the variable's text per layer, front first; image-viewer.js reads the DOM.

// The variable galgame writes the backdrop URL to, on each .gal-bg-layer.
export const BACKDROP_URL_VARIABLE = '--gal-bg-url';

/**
 * The URL inside a CSS `url(...)` value as galgame writes it — `url("…")`, with `\` and `"` escaped by
 * a backslash — or null for an empty value, `none`, or anything that is not a url().
 * @param {?string} value
 * @returns {?string}
 */
export function urlFromCssValue(value) {
  const match = String(value == null ? '' : value).trim().match(/^url\(\s*(["']?)([\s\S]*?)\1\s*\)$/);
  if (!match || !match[2]) return null;
  return match[2].replace(/\\(.)/g, '$1');
}

/**
 * The displayed backdrop's URL: the FRONT layer wins (a cross-fade's target), else the BASE layer (the
 * settled image); null when neither holds one.
 * @param {Array<?string>} layerValues the `--gal-bg-url` text of [front, base], read off each layer's inline style
 * @returns {?string}
 */
export function displayedBackdropUrl(layerValues) {
  for (const value of layerValues || []) {
    const url = urlFromCssValue(value);
    if (url) return url;
  }
  return null;
}
