// galgame-companion · styled-card-dismiss-core — PURE decision for a click while galgame shows a styled
// card (a terminal, an SMS, a letter… any <styled> block it plays as its own page). v0.1
//
// galgame turns a click outside the card into NEXT (upstream src/ui/events.js, the handler on
// '#gal-global-overlay' that returns unless the overlay has `gal-mode-styled`). When the card is the
// last page of the newest reply, NEXT has nowhere to go: galgame only toasts "last AI floor" and the card
// stays over the backdrop, so PREV was the only way back to the picture.
//
// So on that one page — last segment, no later AI floor — a click outside the card hides it, and the next
// click outside brings it back. Everywhere else galgame's own NEXT runs untouched: a card in the middle of
// a reply advances, and a card closing an older reply moves on to the next reply.
//
// "Outside" is galgame's own test, copied whole (v2.5.1), plus <label>: a label forwards its click to its
// control (the companion's advance chip is one), so a click on it is a control click, not a stray one.

export const DISMISSED_CLASS = 'companion-styled-card-dismissed';

export const NOT_OUTSIDE_SELECTOR = [
  '.gal-bottom-toolbar', '.gal-interaction-bar', '.gal-name-badge', '.gal-location-bar', '.gal-time-bar',
  '.gal-status-bar-container', '.gal-bgm-widget', '.gal-fullscreen-btn',
  '.gal-styled-stage-content',
  '.gal-choice-layer', '.gal-popup-modal', '.gal-embedded-viewer', '.gal-cg-viewer', '.gal-special-cg-overlay',
  'button', 'a', 'input', 'textarea', 'select', '[data-action]', '[contenteditable="true"]',
  'label',
].join(', ');

/**
 * galgame sets its progress bar to ((index + 1) / total) * 100 %, so 100 % means the last segment.
 *
 * @param {?string} widthStyle  the bar's inline `style.width`, e.g. "100%"
 * @returns {boolean}
 */
export function isProgressAtEnd(widthStyle) {
  const percent = Number.parseFloat(widthStyle);
  return Number.isFinite(percent) && percent >= 100;
}

/**
 * What a click on galgame's overlay does to the styled card.
 *
 * @param {object} click
 * @param {boolean} click.isStyledMode     the overlay carries galgame's `gal-mode-styled`
 * @param {boolean} click.hasCard          a styled card is mounted on a stage galgame has shown
 * @param {boolean} click.isOutsideCard    the target matches none of NOT_OUTSIDE_SELECTOR
 * @param {boolean} click.isCardDismissed  the card already carries DISMISSED_CLASS
 * @param {boolean} click.isLastSegment    the card is the displayed floor's last segment
 * @param {boolean} click.hasLaterAiFloor  a newer AI floor exists for NEXT to move to
 * @returns {'dismiss'|'restore'|'pass'}   'pass' leaves the click to galgame
 */
export function styledCardClickAction({
  isStyledMode = false, hasCard = false, isOutsideCard = false, isCardDismissed = false,
  isLastSegment = false, hasLaterAiFloor = true,
} = {}) {
  if (!isStyledMode || !hasCard || !isOutsideCard) return 'pass';
  if (isCardDismissed) return 'restore';
  if (isLastSegment && !hasLaterAiFloor) return 'dismiss';
  return 'pass';
}
