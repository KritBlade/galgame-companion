// galgame-companion · galgame-bridge/html-escape-core — text into markup, safely. v0.1
//
// One escaper for every bit of markup this feature builds from strings. The strings mostly come from
// profiles in this repo, but a roster member's NAME comes from the game's state — which the narrator
// wrote — so this is a real sanitiser there, and everywhere else it is what keeps an apostrophe or a
// quote from silently ending an attribute and swallowing the rest of the element.

/**
 * @param {*} text anything; stringified
 * @returns {string} safe inside an element's text or a double-quoted attribute
 */
export function escapeHtml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
