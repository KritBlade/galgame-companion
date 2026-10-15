// galgame-companion · styled-card-dismiss — a styled card closing the newest reply hides on a click outside
// it, and comes back on the next one. v0.1
//
// The decision is styled-card-dismiss-core.js; this file only reads galgame's page and applies it. The
// listener is a CAPTURE listener on the document, so it runs before galgame's own outside-click handler
// (delegated on the same document): stopping propagation here means galgame's NEXT, and its "last AI
// floor" toast, never run for a click this file used.
//
// THE HIDDEN STATE LIVES ON THE CARD ELEMENT. galgame mounts every card with `$content.html(…)`, so any
// page change (PREV, NEXT, a new reply, a re-render) replaces the element and the card shows again with
// nothing here to reset. The hiding itself is CSS in app/style.js: the stage that holds a dismissed card
// fades out and lets clicks through, while galgame still counts it as shown.

import { DOC, log } from '../../env.js';
import { displayedFloor, lastAiFloor } from '../galgame-bridge/index.js';
import { DISMISSED_CLASS, NOT_OUTSIDE_SELECTOR, isProgressAtEnd, styledCardClickAction } from './styled-card-dismiss-core.js';

const OVERLAY_SEL = '#gal-global-overlay';
const STYLED_MODE_CLASS = 'gal-mode-styled';
const STAGE_SEL = '.gal-styled-stage';
const STAGE_SHOWN_CLASS = 'show';
const CARD_SEL = '.gal-styled-stage-content > .gal-styled';
const PROGRESS_SEL = '.gal-progress-bar';

function onClick(e) {
  const target = e.target;
  if (!target || typeof target.closest !== 'function') return;
  const overlay = target.closest(OVERLAY_SEL);
  if (!overlay) return;
  const stage = overlay.querySelector(STAGE_SEL);
  const card = stage && stage.classList.contains(STAGE_SHOWN_CLASS) ? stage.querySelector(CARD_SEL) : null;
  const progress = overlay.querySelector(PROGRESS_SEL);
  const action = styledCardClickAction({
    isStyledMode: overlay.classList.contains(STYLED_MODE_CLASS),
    hasCard: !!card,
    isOutsideCard: !target.closest(NOT_OUTSIDE_SELECTOR),
    isCardDismissed: !!card && card.classList.contains(DISMISSED_CLASS),
    isLastSegment: isProgressAtEnd(progress && progress.style.width),
    hasLaterAiFloor: displayedFloor() < lastAiFloor(),
  });
  if (action === 'pass') return;
  e.stopPropagation();
  card.classList.toggle(DISMISSED_CLASS, action === 'dismiss');
  log.info(`styled-card-dismiss: ${action === 'dismiss' ? 'hid' : 'brought back'} the card closing floor ${displayedFloor()}`);
}

export function startStyledCardDismiss() {
  if (!DOC) { log.warn('styled-card-dismiss: no parent document — skipping'); return; }
  DOC.addEventListener('click', onClick, true);
  log.info('styled-card-dismiss active (a click outside a styled card that closes the newest reply hides it; the next click brings it back)');
}
